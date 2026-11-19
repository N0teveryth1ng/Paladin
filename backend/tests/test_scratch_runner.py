"""Scratch runs record ``finish_reason`` and rerun truncation before measuring."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import pytest

from app.llm.budget import BudgetExhausted
from app.llm.client import Completion, RateLimitedError
from app.llm.scratch_runner import (
    SCRATCH_MAX_TOKENS_CEILING,
    SCRATCH_START_MAX_TOKENS,
    load_scratch_prompts,
    run_scratch,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
VALID = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "valid_response.json"
).read_text(encoding="utf-8")
INVALID_JSON = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "invalid_json.txt"
).read_text(encoding="utf-8")


class CapStubClient:
    """Answer from the requested cap so truncation handling is observable."""

    base_url = "https://stub.test/v1"

    def __init__(self, decide: Callable[[int], Completion]):
        self.decide = decide
        self.caps: list[int] = []

    def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> Completion:
        cap = int(kwargs["max_tokens"])
        self.caps.append(cap)
        return self.decide(cap)


def completion(text: str, finish_reason: str) -> Completion:
    return Completion(
        text=text,
        usage={"completion_tokens": 42, "prompt_tokens": 7},
        latency_ms=1.0,
        finish_reason=finish_reason,
    )


def records(out_dir: Path, mode: str) -> list[dict[str, Any]]:
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((out_dir / "model-a" / mode).glob("sc_*.json"))
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
