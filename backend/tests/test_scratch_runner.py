"""Scratch runs record ``finish_reason`` and rerun truncation before measuring."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import pytest

from app.llm.budget import BudgetExhausted
from app.llm.client import Completion, RateLimitedError, TruncatedError
from app.llm.scratch_runner import (
    SCRATCH_FIXED_MAX_TOKENS,
    SCRATCH_MAX_TOKENS_CEILING,
    SCRATCH_START_MAX_TOKENS,
    load_scratch_prompts,
    run_scratch,
)
from app.llm.system_prompt import (
    SYSTEM_PROMPT_SHA256,
    load_system_prompt,
    load_system_prompt_version,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
VALID = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "valid_response.json"
).read_text(encoding="utf-8")
INVALID_JSON = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "invalid_json.txt"
).read_text(encoding="utf-8")
V12_SHA256 = "EE6E94BF49E16AD22D6EE0191D3C0F50D0FC2DA7D956ABD4458C4BAAF1CE3D2D"


class CapStubClient:
    """Answer from the requested cap so truncation handling is observable."""

    base_url = "https://stub.test/v1"

    def __init__(self, decide: Callable[[int], Completion]):
        self.decide = decide
        self.caps: list[int] = []
        self.kwargs: list[dict[str, Any]] = []
        self.messages: list[list[dict[str, str]]] = []

    def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> Completion:
        cap = int(kwargs["max_tokens"])
        self.caps.append(cap)
        self.kwargs.append(kwargs)
        self.messages.append(messages)
        return self.decide(cap)


def completion(text: str, finish_reason: str) -> Completion:
    return Completion(
        text=text,
        usage={"completion_tokens": 42, "prompt_tokens": 7},
        latency_ms=1.0,
        finish_reason=finish_reason,
    )


def records(
    out_dir: Path, mode: str, version: str | None = None
) -> list[dict[str, Any]]:
    target = out_dir / "model-a" / mode
    if version is not None:
        target = target / f"prompt-{version}"
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(target.glob("sc_*.json"))
    ]


def test_truncated_output_is_rerun_at_a_higher_cap_before_measurement(
    tmp_path: Path,
) -> None:
    def decide(cap: int) -> Completion:
        if cap < SCRATCH_START_MAX_TOKENS * 2:
            return completion(VALID, "length")
        return completion(VALID, "stop")

    client = CapStubClient(decide)
    run_scratch(model="model-a", mode="json_schema", client=client, out_dir=tmp_path)

    assert len(records(tmp_path, "json_schema")) == len(load_scratch_prompts())
    for record in records(tmp_path, "json_schema"):
        assert record["caps_tried"] == [
            SCRATCH_START_MAX_TOKENS,
            SCRATCH_START_MAX_TOKENS * 2,
        ]
        assert record["cap_used"] == SCRATCH_START_MAX_TOKENS * 2
        assert record["runs"][0]["finish_reasons"] == ["length"]
        assert record["runs"][-1]["finish_reasons"] == ["stop"]
        assert record["truncated"] is True
        assert record["measurement_usable"] is True
        assert record["finish_reasons"] == ["stop"]
        assert record["attempts"][0]["finish_reason"] == "stop"


def test_null_content_truncation_reruns_at_a_higher_cap(tmp_path: Path) -> None:
    def decide(cap: int) -> Completion:
        if cap < SCRATCH_START_MAX_TOKENS * 2:
            raise TruncatedError(
                "provider stopped at the token cap before returning content",
                finish_reason="length",
                usage={"completion_tokens": cap},
                latency_ms=1.0,
            )
        return completion(VALID, "stop")

    client = CapStubClient(decide)
    run_scratch(model="model-a", mode="json_schema", client=client, out_dir=tmp_path)

    for record in records(tmp_path, "json_schema"):
        assert record["caps_tried"] == [
            SCRATCH_START_MAX_TOKENS,
            SCRATCH_START_MAX_TOKENS * 2,
        ]
        assert record["runs"][0]["final_status"] == "truncated"
        assert record["runs"][0]["finish_reasons"] == ["length"]
        assert record["measurement_usable"] is True
        assert record["finish_reasons"] == ["stop"]


def test_resume_skips_a_cap_that_already_truncated(tmp_path: Path) -> None:
    target = tmp_path / "model-a" / "json_schema"
    target.mkdir(parents=True)
    (target / "sc_01.json").write_text(
        json.dumps(
            {
                "final_status": "truncated",
                "truncated": True,
                "cap_used": SCRATCH_START_MAX_TOKENS,
                "measurement_usable": False,
            }
        ),
        encoding="utf-8",
    )

    client = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(model="model-a", mode="json_schema", client=client, out_dir=tmp_path)

    assert client.caps[0] == SCRATCH_START_MAX_TOKENS * 2


def test_budget_exhaustion_mid_ladder_keeps_the_paid_caps(tmp_path: Path) -> None:
    def truncate(cap: int) -> Completion:
        raise TruncatedError(
            "provider stopped at the token cap before returning content",
            finish_reason="length",
            usage={"completion_tokens": cap},
            latency_ms=1.0,
        )

    first = CapStubClient(truncate)
    with pytest.raises(BudgetExhausted):
        run_scratch(
            model="model-a",
            mode="json_schema",
            client=first,
            out_dir=tmp_path,
            max_calls=1,
        )

    assert first.caps == [SCRATCH_START_MAX_TOKENS]
    record = records(tmp_path, "json_schema")[0]
    assert record["final_status"] == "budget_exhausted"
    assert record["caps_tried"] == [SCRATCH_START_MAX_TOKENS]
    assert record["measurement_usable"] is False

    second = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(model="model-a", mode="json_schema", client=second, out_dir=tmp_path)

    assert second.caps[0] == SCRATCH_START_MAX_TOKENS * 2


def test_truncation_at_the_ceiling_is_not_used_for_measurement(
    tmp_path: Path,
) -> None:
    client = CapStubClient(lambda cap: completion(VALID, "length"))
    run_scratch(
        model="model-a",
        mode="json_schema",
        client=client,
        out_dir=tmp_path,
        max_calls=None,
    )

    for record in records(tmp_path, "json_schema"):
        assert record["cap_used"] == SCRATCH_MAX_TOKENS_CEILING
        assert record["caps_tried"][-1] == SCRATCH_MAX_TOKENS_CEILING
        assert record["truncated"] is True
        assert record["measurement_usable"] is False
        assert record["finish_reasons"] == ["length"]


def test_schema_invalid_output_is_not_used_for_measurement(tmp_path: Path) -> None:
    client = CapStubClient(lambda cap: completion(INVALID_JSON, "stop"))
    run_scratch(
        model="model-a", mode="schema_in_prompt", client=client, out_dir=tmp_path
    )

    for record in records(tmp_path, "schema_in_prompt"):
        assert record["final_status"] == "schema_invalid"
        assert record["measurement_usable"] is False
        assert record["caps_tried"] == [SCRATCH_START_MAX_TOKENS]
        assert all(
            attempt["finish_reason"] == "stop" for attempt in record["attempts"]
        )


def test_call_cap_stops_and_the_next_run_resumes_settled_prompts(
    tmp_path: Path,
) -> None:
    first = CapStubClient(lambda cap: completion(VALID, "stop"))
    with pytest.raises(BudgetExhausted):
        run_scratch(
            model="model-a",
            mode="json_schema",
            client=first,
            out_dir=tmp_path,
            max_calls=2,
        )

    assert first.caps == [SCRATCH_START_MAX_TOKENS] * 2
    assert len(records(tmp_path, "json_schema")) == 2

    second = CapStubClient(lambda cap: completion(VALID, "stop"))
    written = run_scratch(
        model="model-a",
        mode="json_schema",
        client=second,
        out_dir=tmp_path,
        max_calls=3,
    )

    # The two settled prompts are skipped; only the remaining three are run.
    assert second.caps == [SCRATCH_START_MAX_TOKENS] * 3
    assert len(written) == 3
    assert len(records(tmp_path, "json_schema")) == len(load_scratch_prompts())


def test_fixed_cap_uses_one_call_per_prompt_and_no_ladder(tmp_path: Path) -> None:
    client = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(
        model="model-a",
        mode="json_schema",
        client=client,
        out_dir=tmp_path,
        fixed_max_tokens=SCRATCH_FIXED_MAX_TOKENS,
    )

    for record in records(tmp_path, "json_schema"):
        assert record["caps_tried"] == [SCRATCH_FIXED_MAX_TOKENS]
        assert record["cap_used"] == SCRATCH_FIXED_MAX_TOKENS
        assert record["fixed_max_tokens"] == SCRATCH_FIXED_MAX_TOKENS
        assert record["truncated"] is False
        assert record["measurement_usable"] is True
        assert record["final_status"] == "schema_valid"

    assert client.caps == [SCRATCH_FIXED_MAX_TOKENS] * len(load_scratch_prompts())


def test_fixed_cap_length_is_a_truncation_failure(tmp_path: Path) -> None:
    client = CapStubClient(lambda cap: completion(VALID, "length"))
    run_scratch(
        model="model-a",
        mode="json_schema",
        client=client,
        out_dir=tmp_path,
        fixed_max_tokens=SCRATCH_FIXED_MAX_TOKENS,
    )

    for record in records(tmp_path, "json_schema"):
        assert record["caps_tried"] == [SCRATCH_FIXED_MAX_TOKENS]
        assert record["truncated"] is True
        assert record["measurement_usable"] is False
        assert record["final_status"] == "truncated"

    assert client.caps == [SCRATCH_FIXED_MAX_TOKENS] * len(load_scratch_prompts())


def test_fixed_truncation_is_settled_and_not_rerun(tmp_path: Path) -> None:
    run_scratch(
        model="model-a",
        mode="json_schema",
        client=CapStubClient(lambda cap: completion(VALID, "length")),
        out_dir=tmp_path,
        fixed_max_tokens=SCRATCH_FIXED_MAX_TOKENS,
    )

    second = CapStubClient(lambda cap: completion(VALID, "stop"))
    written = run_scratch(
        model="model-a",
        mode="json_schema",
        client=second,
        out_dir=tmp_path,
        fixed_max_tokens=SCRATCH_FIXED_MAX_TOKENS,
    )

    assert written == []
    assert second.caps == []


def test_fixed_cap_outside_the_ceiling_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="fixed_max_tokens"):
        run_scratch(
            model="model-a",
            mode="json_schema",
            client=CapStubClient(lambda cap: completion(VALID, "stop")),
            out_dir=tmp_path,
            fixed_max_tokens=SCRATCH_MAX_TOKENS_CEILING + 1,
        )


def test_reasoning_object_is_forwarded_to_every_call(tmp_path: Path) -> None:
    client = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(
        model="model-a",
        mode="json_schema",
        client=client,
        out_dir=tmp_path,
        fixed_max_tokens=SCRATCH_FIXED_MAX_TOKENS,
        reasoning={"enabled": False},
    )

    assert all(kwargs["reasoning"] == {"enabled": False} for kwargs in client.kwargs)
    for record in records(tmp_path, "json_schema"):
        assert record["reasoning"] == {"enabled": False}


def test_rate_limit_stops_the_scratch_run_and_resumes(tmp_path: Path) -> None:
    def limited_decide(cap: int) -> Completion:
        raise RateLimitedError("429")

    limited = CapStubClient(limited_decide)
    written = run_scratch(
        model="model-a", mode="json_schema", client=limited, out_dir=tmp_path
    )

    assert len(written) == 1
    assert limited.caps == [SCRATCH_START_MAX_TOKENS]
    record = records(tmp_path, "json_schema")[0]
    assert record["final_status"] == "rate_limited"
    assert record["measurement_usable"] is False

    resumed = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(
        model="model-a", mode="json_schema", client=resumed, out_dir=tmp_path
    )

    assert len(records(tmp_path, "json_schema")) == len(load_scratch_prompts())
    assert len(resumed.caps) == len(load_scratch_prompts())


def _system_messages(client: CapStubClient) -> list[str]:
    return [
        message["content"]
        for messages in client.messages
        for message in messages
        if message["role"] == "system"
    ]


def test_default_scratch_run_uses_v11_and_keeps_the_record_path(tmp_path: Path) -> None:
    client = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(model="model-a", mode="json_schema", client=client, out_dir=tmp_path)

    assert client.messages
    assert _system_messages(client) == [load_system_prompt()] * len(client.messages)
    for record in records(tmp_path, "json_schema"):
        assert record["system_prompt_version"] == "1.1"
        assert record["system_prompt_sha256"] == SYSTEM_PROMPT_SHA256
    assert (tmp_path / "model-a" / "json_schema" / "sc_01.json").is_file()
    assert not (tmp_path / "model-a" / "json_schema" / "prompt-1.1").exists()


def test_requested_v12_uses_its_prompt_and_versioned_path(tmp_path: Path) -> None:
    client = CapStubClient(lambda cap: completion(VALID, "stop"))
    run_scratch(
        model="model-a",
        mode="json_schema",
        client=client,
        out_dir=tmp_path,
        system_prompt_version="1.2",
    )

    assert client.messages
    assert _system_messages(client) == [load_system_prompt_version("1.2")] * len(
        client.messages
    )
    for record in records(tmp_path, "json_schema", version="1.2"):
        assert record["system_prompt_version"] == "1.2"
        assert record["system_prompt_sha256"] == V12_SHA256
    assert (
        tmp_path / "model-a" / "json_schema" / "prompt-1.2" / "sc_01.json"
    ).is_file()


def test_unknown_system_prompt_version_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="unknown system prompt version"):
        run_scratch(
            model="model-a",
            mode="json_schema",
            client=CapStubClient(lambda cap: completion(VALID, "stop")),
            out_dir=tmp_path,
            system_prompt_version="9.9",
        )


def test_settled_record_from_another_version_is_not_skipped(tmp_path: Path) -> None:
    target = tmp_path / "model-a" / "json_schema" / "prompt-1.2"
    target.mkdir(parents=True)
    (target / "sc_01.json").write_text(
        json.dumps(
            {
                "system_prompt_version": "1.1",
                "measurement_usable": True,
                "final_status": "schema_valid",
            }
        ),
        encoding="utf-8",
    )

    client = CapStubClient(lambda cap: completion(VALID, "stop"))
    written = run_scratch(
        model="model-a",
        mode="json_schema",
        client=client,
        out_dir=tmp_path,
        system_prompt_version="1.2",
    )

    assert len(written) == len(load_scratch_prompts())
    first = json.loads((target / "sc_01.json").read_text(encoding="utf-8"))
    assert first["system_prompt_version"] == "1.2"
