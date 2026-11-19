"""Adding selected_model is invariant-safe; the committed freeze stays untouched."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from app.api.config import startup_check
from app.llm.system_prompt import load_system_prompt

REPO_ROOT = Path(__file__).resolve().parents[2]
COMMITTED_FREEZE = REPO_ROOT / "eval" / "freeze.json"
EVAL_SET = REPO_ROOT / "eval" / "eval_set.json"
COMMITTED_BYTES = COMMITTED_FREEZE.read_bytes()
MODEL = "nemotron-3.5-super-vl"


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest().upper()


def original() -> dict:
    return json.loads(COMMITTED_BYTES.decode("utf-8"))


def copy_without_model(tmp_path: Path) -> tuple[Path, dict]:
    payload = original()
    payload.pop("selected_model", None)
    path = tmp_path / "freeze-copy.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path, payload


def test_base_copy_has_no_selected_model(tmp_path: Path) -> None:
    _, payload = copy_without_model(tmp_path)
    assert "selected_model" not in payload
    assert payload["scored_run_approved"] is False


def test_only_added_key_differs(tmp_path: Path) -> None:
    _, before = copy_without_model(tmp_path)
    after = copy.deepcopy(before)
    after["selected_model"] = MODEL

    removed = set(before) - set(after)
    added = set(after) - set(before)
    changed = {key for key in set(before) & set(after) if before[key] != after[key]}
    assert removed == set()
    assert added == {"selected_model"}
    assert changed == set()


def test_hashed_and_shared_settings_unchanged(tmp_path: Path) -> None:
    _, before = copy_without_model(tmp_path)
    after = {**before, "selected_model": MODEL}

    keys = (
        "eval_set_sha256",
        "system_prompt_sha256",
        "thresholds",
        "shared_settings",
        "max_tokens",
        "models",
        "reasoning_transform",
        "scored_run_approved",
    )
    for key in keys:
        assert after[key] == before[key]


def test_recomputed_hashes_still_match(tmp_path: Path) -> None:
    _, payload = copy_without_model(tmp_path)
    after = {**payload, "selected_model": MODEL}

    assert sha256_bytes(EVAL_SET.read_bytes()) == after["eval_set_sha256"]
    assert (
        sha256_bytes(load_system_prompt().encode("utf-8"))
        == after["system_prompt_sha256"]
    )
    path = tmp_path / "freeze-selected.json"
    path.write_text(json.dumps(after, indent=2), encoding="utf-8")
    bundle = startup_check(path)
    assert bundle.selected_model == MODEL
    assert bundle.max_run_seconds == 1500


def test_committed_freeze_never_written(tmp_path: Path) -> None:
    _, before = copy_without_model(tmp_path)
    after = {**before, "selected_model": MODEL}
    path = tmp_path / "freeze-selected.json"
    path.write_text(json.dumps(after, indent=2), encoding="utf-8")
    startup_check(path)

    assert COMMITTED_FREEZE.read_bytes() == COMMITTED_BYTES
    assert "selected_model" not in original()
    assert original()["scored_run_approved"] is False
