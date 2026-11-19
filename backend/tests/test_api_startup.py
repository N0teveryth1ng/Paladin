"""Startup refusal, no-model API state and derived health metadata."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.__main__ import main
from app.api.config import FreezeError, startup_check
from app.api.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]
COMMITTED_FREEZE = REPO_ROOT / "eval" / "freeze.json"
MODEL = "nemotron-3.5-super-vl"


def freeze_payload() -> dict:
    return json.loads(COMMITTED_FREEZE.read_text(encoding="utf-8"))


def write_freeze(tmp_path: Path, payload: dict) -> Path:
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def valid_freeze(tmp_path: Path, **overrides) -> Path:
    payload = freeze_payload()
    payload["selected_model"] = MODEL
    payload.update(overrides)
    return write_freeze(tmp_path, payload)


@pytest.mark.parametrize(
    "value",
    [None, "", "   "],
    ids=["missing", "empty", "whitespace"],
)
def test_missing_or_empty_selected_model_refuses(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], value
) -> None:
    payload = freeze_payload()
    if value is not None:
        payload["selected_model"] = value
    path = write_freeze(tmp_path, payload)

    with pytest.raises(FreezeError) as error:
        startup_check(path)
    message = str(error.value)
    assert "freeze.json" in message
    assert "selected_model" in message

    assert main([str(path)]) != 0
    printed = capsys.readouterr().err
    assert "freeze.json" in printed
    assert "selected_model" in printed


def test_unknown_selected_model_refuses(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = write_freeze(
        tmp_path,
        {**freeze_payload(), "selected_model": "not-in-models"},
    )

    with pytest.raises(FreezeError, match="selected_model"):
        startup_check(path)
    assert main([str(path)]) != 0
    printed = capsys.readouterr().err
    assert "freeze.json" in printed
    assert "selected_model" in printed


def test_system_prompt_hash_mismatch_refuses(tmp_path: Path) -> None:
    path = valid_freeze(tmp_path, system_prompt_sha256="0" * 64)

    with pytest.raises(FreezeError, match="mismatch"):
        startup_check(path)
    assert main([str(path)]) != 0


def test_valid_freeze_health_reports_selected_model_and_derived_max(
    tmp_path: Path,
) -> None:
    path = valid_freeze(tmp_path)
    app = create_app(freeze_path=path)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model"] == MODEL
    assert body["system_prompt_version"] == "1.1"
    assert body["rules_version"] == "1.1"
    assert body["max_run_seconds"] == 1500


def test_no_model_app_reports_503_everywhere(tmp_path: Path) -> None:
    app = create_app(bundle=None, freeze_path=tmp_path / "freeze.json")

    with TestClient(app) as client:
        health = client.get("/api/health")
        post = client.post("/api/runs", json={"prompt": "Design a URL shortener."})
        get = client.get("/api/runs/does-not-exist")

    assert health.status_code == 503
    body = health.json()
    assert body["status"] == "unavailable"
    assert body["model"] == "no model selected"
    assert body["message"] == (
        "freeze.json has no selected_model; no fallback model is used"
    )
    assert body["max_run_seconds"] == 1500

    assert post.status_code == 503
    assert post.json()["error"]["code"] == "no_model_selected"
    assert get.status_code == 503
    assert get.json()["error"]["code"] == "no_model_selected"

    rendered = json.dumps([health.json(), post.json(), get.json()])
    for name in json.loads(COMMITTED_FREEZE.read_text(encoding="utf-8"))["models"]:
        assert name not in rendered
