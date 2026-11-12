"""The runner refuses drift and missing evidence, then records the protocol."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.eval import constants
from app.eval.runner import (
    RefusalError,
    check_preconditions,
    run_scored,
    sha256_file,
)
from app.llm.client import (
    Completion,
    LLMTimeoutError,
    RateLimitedError,
)
from app.llm.system_prompt import SYSTEM_PROMPT_SHA256, SYSTEM_PROMPT_VERSION

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_SET = REPO_ROOT / "eval" / "eval_set.json"
SCHEMA = REPO_ROOT / "schema" / "architecture.generation.schema.json"
VALID = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "valid_response.json"
).read_text(encoding="utf-8")

RUN_FIELDS = {
    "run_id",
    "model",
    "base_url_host",
    "eval_set_sha256",
    "prompt_id",
    "prompt_sha256",
    "system_prompt_version",
    "system_prompt_sha256",
    "settings",
    "run_index",
    "started_at",
    "finished_at",
    "attempts",
    "final_status",
    "first_attempt_schema_valid",
    "architecture_path",
    "gate",
}


class StubClient:
    base_url = "https://stub.test/v1"

    def __init__(self, responses: list[Any] | None = None):
        self.responses = list(responses or [])
        self.calls = 0

    def complete(self, messages, **kwargs):
        self.calls += 1
        if self.responses:
            item = self.responses.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return Completion(
            text=VALID,
            usage={"completion_tokens": 20},
            latency_ms=3.0,
            finish_reason="stop",
        )


def freeze(
    *,
    eval_set_sha256: str | None = None,
    approved: bool = True,
    max_tokens: int | None = 1000,
    measurements: list[dict[str, Any]] | None = None,
    models: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "eval_set_sha256": eval_set_sha256 or sha256_file(EVAL_SET),
        "system_prompt_version": SYSTEM_PROMPT_VERSION,
        "system_prompt_sha256": SYSTEM_PROMPT_SHA256,
        "thresholds": constants.THRESHOLDS,
        "shared_settings": constants.SHARED_SETTINGS,
        "max_tokens": max_tokens,
        "max_tokens_measurements": (
            [{"model": "m", "mode": "json_schema", "prompt_id": "sc_01", "output_tokens": 400}]
            if measurements is None
            else measurements
        ),
        "reasoning_transform": None,
        "models": (
            {"test-model": {"model_id": "test-model", "response_mode": "json_schema", "notes": ""}}
            if models is None
            else models
        ),
        "scored_run_approved": approved,
    }


def write_freeze(tmp_path: Path, payload: dict[str, Any]) -> Path:
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def run(
    tmp_path: Path,
    *,
    freeze_payload: dict[str, Any] | None = None,
    client: StubClient | None = None,
    eval_set: Path = EVAL_SET,
    model: str = "test-model",
    only_prompt: str | None = "ev_01",
    force: bool = False,
    sleep=lambda seconds: None,
) -> list[Path]:
    freeze_path = write_freeze(tmp_path, freeze_payload or freeze())
    return run_scored(
        model=model,
        client=client or StubClient(),
        out_dir=tmp_path / "runs",
        freeze_path=freeze_path,
        eval_set_path=eval_set,
        schema_path=SCHEMA,
        only_prompt=only_prompt,
        force=force,
        sleep=sleep,
        base_url="https://stub.test/v1",
    )


def test_hash_mismatch_refuses_and_writes_nothing(tmp_path: Path) -> None:
    tampered = tmp_path / "eval_set.json"
    tampered.write_bytes(EVAL_SET.read_bytes() + b" ")

    with pytest.raises(RefusalError) as error:
        run(
            tmp_path,
            freeze_payload=freeze(eval_set_sha256=sha256_file(EVAL_SET)),
            eval_set=tampered,
        )

    message = str(error.value)
    assert "hash mismatch" in message
    assert sha256_file(EVAL_SET) in message
    assert sha256_file(tampered) in message
    assert not (tmp_path / "runs" / "test-model").exists()


def test_unapproved_harness_refuses(tmp_path: Path) -> None:
    with pytest.raises(RefusalError, match="not approved"):
        run(tmp_path, freeze_payload=freeze(approved=False))
    assert not (tmp_path / "runs" / "test-model").exists()


def test_unmeasured_max_tokens_refuses(tmp_path: Path) -> None:
    with pytest.raises(RefusalError, match="max_tokens"):
        run(tmp_path, freeze_payload=freeze(measurements=[], max_tokens=None))


def test_max_tokens_without_headroom_refuses(tmp_path: Path) -> None:
    with pytest.raises(RefusalError, match="headroom"):
        run(tmp_path, freeze_payload=freeze(measurements=[{"output_tokens": 400}], max_tokens=700))


def test_unknown_model_refuses(tmp_path: Path) -> None:
    with pytest.raises(RefusalError, match="response mode"):
        run(tmp_path, freeze_payload=freeze(models={}))


def test_three_runs_per_prompt_with_every_field(tmp_path: Path) -> None:
    written = run(tmp_path)

    assert len(written) == constants.RUNS_PER_PROMPT
    for path in written:
        record = json.loads(path.read_text(encoding="utf-8"))
        assert RUN_FIELDS <= set(record)
        assert record["final_status"] == "schema_valid"
        assert record["first_attempt_schema_valid"] is True
        assert record["gate"]["passed"] is True
        assert record["architecture_path"]
        assert set(record["settings"]) == {
            "temperature",
            "max_tokens",
            "timeout_s",
            "response_mode",
            "max_attempts",
        }
        assert record["settings"]["temperature"] == constants.TEMPERATURE
        assert record["settings"]["max_tokens"] == 1000


def test_settings_are_identical_across_models_except_response_mode(
    tmp_path: Path,
) -> None:
    models = {
        "model-a": {"model_id": "model-a", "response_mode": "json_schema", "notes": ""},
        "model-b": {
            "model_id": "model-b",
            "response_mode": "schema_in_prompt",
            "notes": "",
        },
    }
    payload = freeze(models=models)
    run(tmp_path, freeze_payload=payload, model="model-a")
    run(tmp_path, freeze_payload=payload, model="model-b")

    a = json.loads(
        (tmp_path / "runs" / "model-a" / "ev_01" / "run-1.json").read_text(encoding="utf-8")
    )
    b = json.loads(
        (tmp_path / "runs" / "model-b" / "ev_01" / "run-1.json").read_text(encoding="utf-8")
    )

    settings_a = dict(a["settings"])
    settings_b = dict(b["settings"])
    assert settings_a.pop("response_mode") == "json_schema"
    assert settings_b.pop("response_mode") == "schema_in_prompt"
    assert settings_a == settings_b


def test_resume_skips_terminal_and_retries_infrastructure(tmp_path: Path) -> None:
    client = StubClient()
    run(tmp_path, client=client)
    assert client.calls == 3

    run_one = tmp_path / "runs" / "test-model" / "ev_01" / "run-1.json"
    run_two = tmp_path / "runs" / "test-model" / "ev_01" / "run-2.json"
    run_three = tmp_path / "runs" / "test-model" / "ev_01" / "run-3.json"

    record_one = json.loads(run_one.read_text(encoding="utf-8"))
    record_one["final_status"] = "rate_limited"
    record_one["attempts"] = []
    run_one.write_text(json.dumps(record_one), encoding="utf-8")

    before_two = run_two.read_bytes()
    before_three = run_three.read_bytes()

    run(tmp_path, client=client)

    assert client.calls == 4
    assert json.loads(run_one.read_text(encoding="utf-8"))["final_status"] == "schema_valid"
    assert run_two.read_bytes() == before_two
    assert run_three.read_bytes() == before_three


def test_force_reruns_terminal_records(tmp_path: Path) -> None:
    client = StubClient()
    run(tmp_path, client=client)
    assert client.calls == 3
    run(tmp_path, client=client, force=True)
    assert client.calls == 6


def test_rate_limit_waits_are_bounded(tmp_path: Path) -> None:
    sleeps: list[float] = []
    client = StubClient([RateLimitedError("429")] * 100)

    run(tmp_path, client=client, sleep=sleeps.append)

    record = json.loads(
        (tmp_path / "runs" / "test-model" / "ev_01" / "run-1.json").read_text(
            encoding="utf-8"
        )
    )
    assert record["final_status"] == "rate_limited"
    assert len(record["attempts"]) == constants.MAX_RATE_LIMIT_WAITS + 1
    assert len(sleeps) == constants.RUNS_PER_PROMPT * constants.MAX_RATE_LIMIT_WAITS


def test_prompt_flag_restricts_the_run(tmp_path: Path) -> None:
    run(tmp_path, only_prompt="ev_02")

    prompt_dirs = sorted(
        path.name for path in (tmp_path / "runs" / "test-model").glob("ev_*")
    )
    assert prompt_dirs == ["ev_02"]


def test_second_timeout_is_a_failed_run(tmp_path: Path) -> None:
    client = StubClient(
        [
            LLMTimeoutError("timed out"),
            LLMTimeoutError("timed out"),
            Completion(text=VALID, usage={}, latency_ms=1.0),
            Completion(text=VALID, usage={}, latency_ms=1.0),
        ]
    )
    run(tmp_path, client=client)

    record = json.loads(
        (tmp_path / "runs" / "test-model" / "ev_01" / "run-1.json").read_text(
            encoding="utf-8"
        )
    )
    assert record["final_status"] == "timeout_failed"
    assert record["first_attempt_schema_valid"] is False
    assert record["gate"]["passed"] is False


def test_scored_runner_never_opens_the_scratch_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    opened: list[str] = []
    real_open = Path.open

    def spy(self, *args, **kwargs):
        opened.append(str(self))
        return real_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", spy)
    run(tmp_path)

    assert not [path for path in opened if "scratch" in path.lower()]


def test_preconditions_accept_the_shipped_freeze_shape(tmp_path: Path) -> None:
    payload = freeze()
    check_preconditions(payload, EVAL_SET, "test-model")
