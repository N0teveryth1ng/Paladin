"""Dual eval-version support: v1.0 stays byte-identical, v2.0 is separated."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.eval import constants
from app.eval.models import EvalSet
from app.eval.report import generate_report
from app.eval.runner import (
    DEFAULT_EVAL_SET,
    DEFAULT_EVAL_SET_V2,
    EVAL_SET_PATHS,
    RefusalError,
    check_preconditions,
    expected_eval_set_hash,
    expected_system_prompt_hash,
    resolve_eval_set_path,
    run_scored,
    sha256_file,
)
from app.llm.client import Completion
from app.llm.system_prompt import (
    SYSTEM_PROMPT_SHA256,
    SYSTEM_PROMPT_VERSION,
    load_system_prompt_version,
    system_prompt_sha256,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FREEZE_PATH = REPO_ROOT / "eval" / "freeze.json"
SCHEMA = REPO_ROOT / "schema" / "architecture.generation.schema.json"
VALID = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "valid_response.json"
).read_text(encoding="utf-8")

V1_EVAL_SHA = "280E2E4145A2034BC73C213D59374BF94779666D3A25E407F5F60BB1F9C024DC"
V2_EVAL_SHA = "BD713F574A3C1EDFD6E450B38EF055B0AEEB18350CA62B1DB77DCC87F1E2770E"
V12_SHA = "EE6E94BF49E16AD22D6EE0191D3C0F50D0FC2DA7D956ABD4458C4BAAF1CE3D2D"
MODEL = "nemotron-3.5-super-vl"

V1_RECORD_FIELDS = {
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


def _payload() -> dict[str, Any]:
    return json.loads(FREEZE_PATH.read_text(encoding="utf-8"))


def _freeze_path(tmp_path: Path, payload: dict[str, Any] | None = None) -> Path:
    """A writable freeze copy so tests never depend on the owner's approval flag."""

    data = payload if payload is not None else _payload()
    data["scored_run_approved"] = True
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return path


class CapturingClient:
    base_url = "https://stub.test/v1"

    def __init__(self) -> None:
        self.calls = 0
        self.system_contents: list[str] = []

    def complete(self, messages, **kwargs) -> Completion:
        self.calls += 1
        self.system_contents.append(messages[0]["content"])
        return Completion(
            text=VALID,
            usage={"completion_tokens": 20},
            latency_ms=3.0,
            finish_reason="stop",
        )


def _run(
    tmp_path: Path,
    version: str,
    *,
    out_dir_name: str = "runs",
    only_prompt: str,
    freeze_path: Path | None = None,
) -> tuple[CapturingClient, list[Path]]:
    client = CapturingClient()
    paths = run_scored(
        model=MODEL,
        client=client,
        out_dir=tmp_path / out_dir_name,
        freeze_path=freeze_path or _freeze_path(tmp_path),
        eval_set_path=resolve_eval_set_path(version),
        schema_path=SCHEMA,
        eval_set_version=version,
        only_prompt=only_prompt,
        base_url="https://stub.test/v1",
    )
    return client, paths


def _records(paths: list[Path]) -> list[dict[str, Any]]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in paths]


# 1 ---------------------------------------------------------------------
def test_freeze_carries_both_version_blocks_without_editing_v1_fields() -> None:
    freeze = _payload()

    assert freeze["eval_set_sha256"] == V1_EVAL_SHA == sha256_file(DEFAULT_EVAL_SET)
    assert freeze["system_prompt_version"] == SYSTEM_PROMPT_VERSION == "1.1"
    assert freeze["system_prompt_sha256"] == SYSTEM_PROMPT_SHA256
    assert freeze["eval_set_version"] == "1.0"
    assert "selected_model" not in freeze
    assert freeze["eval_sets"] == {
        "1.0": {"path": "eval/eval_set.json", "sha256": V1_EVAL_SHA},
        "2.0": {"path": "eval/eval_set_v2.json", "sha256": V2_EVAL_SHA},
    }
    assert freeze["system_prompts"]["1.1"]["sha256"] == SYSTEM_PROMPT_SHA256
    assert freeze["system_prompts"]["1.2"] == {
        "path": "prompts/system/architecture-v1.2.md",
        "sha256": V12_SHA,
    }
    assert sha256_file(DEFAULT_EVAL_SET_V2) == V2_EVAL_SHA
    assert system_prompt_sha256(load_system_prompt_version("1.2")) == V12_SHA


# 2 ---------------------------------------------------------------------
def test_version_helpers_select_the_right_path_and_hash() -> None:
    freeze = _payload()

    assert resolve_eval_set_path() == DEFAULT_EVAL_SET
    assert resolve_eval_set_path("1.0") == DEFAULT_EVAL_SET
    assert resolve_eval_set_path("2.0") == DEFAULT_EVAL_SET_V2
    assert EVAL_SET_PATHS == {"1.0": DEFAULT_EVAL_SET, "2.0": DEFAULT_EVAL_SET_V2}

    assert expected_eval_set_hash(freeze) == V1_EVAL_SHA
    assert expected_eval_set_hash(freeze, "1.0") == V1_EVAL_SHA
    assert expected_eval_set_hash(freeze, "2.0") == V2_EVAL_SHA
    assert expected_system_prompt_hash(freeze) == SYSTEM_PROMPT_SHA256
    assert expected_system_prompt_hash(freeze, "2.0") == V12_SHA

    with pytest.raises(RefusalError, match="unknown eval set version"):
        resolve_eval_set_path("9.9")
    with pytest.raises(RefusalError):
        expected_eval_set_hash(freeze, "9.9")
    with pytest.raises(RefusalError, match="unknown eval set version"):
        expected_system_prompt_hash(freeze, "9.9")


# 3 ---------------------------------------------------------------------
def test_missing_or_wrong_v2_hash_is_refused(tmp_path: Path) -> None:
    missing = _payload()
    del missing["eval_sets"]["2.0"]
    with pytest.raises(RefusalError, match="no sha256 for eval set version"):
        check_preconditions(missing, DEFAULT_EVAL_SET_V2, MODEL, "2.0")

    wrong = _payload()
    wrong["eval_sets"]["2.0"]["sha256"] = "0" * 64
    with pytest.raises(RefusalError, match="hash mismatch"):
        check_preconditions(wrong, DEFAULT_EVAL_SET_V2, MODEL, "2.0")

    # The v1.2 prompt hash is verified by run_scored before any call or write.
    tampered_prompt = _payload()
    tampered_prompt["system_prompts"]["1.2"]["sha256"] = "0" * 64
    with pytest.raises(RefusalError, match="system prompt hash mismatch"):
        run_scored(
            model=MODEL,
            client=CapturingClient(),
            out_dir=tmp_path / "no-write",
            freeze_path=_freeze_path(tmp_path, tampered_prompt),
            eval_set_path=DEFAULT_EVAL_SET_V2,
            schema_path=SCHEMA,
            eval_set_version="2.0",
            only_prompt="ev2_01",
        )
    assert not (tmp_path / "no-write").exists()


# 4 ---------------------------------------------------------------------
def test_v1_records_keep_their_exact_shape_and_hashes(tmp_path: Path) -> None:
    _, paths = _run(tmp_path, "1.0", only_prompt="ev_01")

    assert len(paths) == constants.RUNS_PER_PROMPT
    for path, record in zip(paths, _records(paths)):
        assert path.parent.name == "ev_01"
        assert set(record) == V1_RECORD_FIELDS
        assert "eval_set_version" not in record
        assert record["eval_set_sha256"] == V1_EVAL_SHA
        assert record["system_prompt_version"] == "1.1"
        assert record["system_prompt_sha256"] == SYSTEM_PROMPT_SHA256


# 5 ---------------------------------------------------------------------
def test_v2_records_carry_the_version_and_the_v1_2_prompt(tmp_path: Path) -> None:
    client, paths = _run(tmp_path, "2.0", only_prompt="ev2_01")

    assert len(paths) == constants.RUNS_PER_PROMPT
    assert client.calls == constants.RUNS_PER_PROMPT
    for path, record in zip(paths, _records(paths)):
        assert path.parent.name == "ev2_01"
        assert V1_RECORD_FIELDS <= set(record)
        assert record["eval_set_version"] == "2.0"
        assert record["eval_set_sha256"] == V2_EVAL_SHA
        assert record["system_prompt_version"] == "1.2"
        assert record["system_prompt_sha256"] == V12_SHA
        assert record["prompt_id"] == "ev2_01"

    # The runner really loaded v1.2, not merely a relabelled v1.1 record.
    assert client.system_contents
    assert all(text == load_system_prompt_version("1.2") for text in client.system_contents)
    assert all("Minimal, justified structure" in text for text in client.system_contents)


# 6 ---------------------------------------------------------------------
def test_report_paths_and_headers_are_separated(tmp_path: Path) -> None:
    _run(tmp_path, "1.0", out_dir_name="v1-runs", only_prompt="ev_01")
    _run(tmp_path, "2.0", out_dir_name="v2-runs", only_prompt="ev2_01")

    v1_runs = tmp_path / "v1-runs"
    v2_runs = tmp_path / "v2-runs"
    v1_text = generate_report(v1_runs, eval_set_version="1.0")
    v2_text = generate_report(v2_runs, eval_set_version="2.0")

    assert (v1_runs / "report.md").read_text(encoding="utf-8") == v1_text
    assert (v2_runs / "v2" / "report.md").read_text(encoding="utf-8") == v2_text
    assert not (v2_runs / "report.md").exists()
    assert not (v2_runs / "v2" / "v2").exists()

    assert f"Eval set SHA-256: {V1_EVAL_SHA}" in v1_text
    assert "Eval set version: 2.0" not in v1_text
    assert "System prompt: 1.1" in v1_text

    assert f"Eval set SHA-256: {V2_EVAL_SHA}" in v2_text
    assert "Eval set version: 2.0" in v2_text
    assert f"System prompt: v1.2 ({V12_SHA})" in v2_text

    before = (v1_runs / "report.md").read_bytes()
    generate_report(v2_runs, eval_set_version="2.0")
    assert (v1_runs / "report.md").read_bytes() == before


# 7 ---------------------------------------------------------------------
def test_v2_eval_set_shape_is_visible_to_the_shared_models() -> None:
    payload = json.loads(DEFAULT_EVAL_SET_V2.read_text(encoding="utf-8"))
    eval_set = EvalSet.model_validate(payload)

    assert eval_set.eval_set_version == "2.0"
    assert len(eval_set.prompts) == 15
    assert all(prompt.id.startswith("ev2_") for prompt in eval_set.prompts)
