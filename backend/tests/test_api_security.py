"""Loopback CORS, key redaction, no settings logging and no fake env switch."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.config import startup_check
from app.api.main import create_app, get_client_factory
from tests.fixtures.api.fake_client import FakeClient, factory_for, success_draft

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_API = REPO_ROOT / "backend" / "app" / "api"
MODEL = "nemotron-3.5-super-vl"
SENTINEL_KEY = "sk-sentinel-DO-NOT-LEAK-9f3c"
SENTINEL_BASE_URL = "https://provider.example.test/v1"
TERMINAL = {"succeeded", "failed", "timeout"}


def bundle(tmp_path: Path):
    payload = json.loads((REPO_ROOT / "eval" / "freeze.json").read_text())
    payload["selected_model"] = MODEL
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return startup_check(path)


def wait_terminal(app, run_id: str, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = app.state.registry.get(run_id)
        if body["state"] in TERMINAL:
            return body
        time.sleep(0.005)
    raise AssertionError("run did not finish")


def test_cors_allows_exactly_two_loopback_origins(tmp_path: Path) -> None:
    app = create_app(bundle=bundle(tmp_path))
    with TestClient(app) as client:
        for origin in ("http://127.0.0.1:5173", "http://127.0.0.1:4173"):
            response = client.get("/api/health", headers={"Origin": origin})
            assert response.headers["access-control-allow-origin"] == origin
            assert response.headers["cache-control"] == "no-store"
        denied = client.get(
            "/api/health", headers={"Origin": "http://localhost:5173"}
        )
    assert "access-control-allow-origin" not in denied.headers


def test_key_and_authorization_never_appear_in_responses_or_logs(
    tmp_path: Path, caplog
) -> None:
    class LeakyClient(FakeClient):
        def complete(self, messages, **kwargs):
            raise RuntimeError(
                f"provider Authorization: Bearer {SENTINEL_KEY} at {SENTINEL_BASE_URL}"
            )

    app = create_app(bundle=bundle(tmp_path))
    fake = LeakyClient()
    app.dependency_overrides[get_client_factory] = lambda: factory_for(fake)

    with caplog.at_level(logging.DEBUG):
        with TestClient(app) as client:
            created = client.post("/api/runs", json={"prompt": "leak test"})
            run_id = created.json()["run_id"]
            body = wait_terminal(app, run_id)
            polled = client.get(f"/api/runs/{run_id}")
            health = client.get("/api/health")

    rendered = json.dumps([created.json(), body, polled.json(), health.json(), caplog.text])
    assert body["error"]["code"] == "internal_error"
    assert SENTINEL_KEY not in rendered
    assert "Authorization" not in rendered
    assert SENTINEL_BASE_URL not in rendered
    assert created.headers["cache-control"] == "no-store"
    assert polled.headers["cache-control"] == "no-store"


def test_settings_object_is_never_logged(tmp_path: Path, caplog) -> None:
    fake = FakeClient()
    app = create_app(bundle=bundle(tmp_path))
    app.dependency_overrides[get_client_factory] = lambda: factory_for(fake)

    with caplog.at_level(logging.DEBUG):
        with TestClient(app) as client:
            run_id = client.post("/api/runs", json={"prompt": "no settings"}).json()[
                "run_id"
            ]
            wait_terminal(app, run_id)

    assert "Settings(" not in caplog.text
    assert "api_key" not in caplog.text
    assert SENTINEL_KEY not in caplog.text


def test_health_has_no_key_or_base_url_in_either_state(tmp_path: Path) -> None:
    selected = create_app(bundle=bundle(tmp_path))
    unselected = create_app(bundle=None)
    with TestClient(selected) as client:
        ok = client.get("/api/health")
    with TestClient(unselected) as client:
        unavailable = client.get("/api/health")

    for response in (ok, unavailable):
        text = response.text
        assert SENTINEL_KEY not in text
        assert SENTINEL_BASE_URL not in text
        assert "Authorization" not in text
        assert "system_prompt_sha256" not in text
        assert "system_prompt_version" in text
    assert ok.status_code == 200
    assert unavailable.status_code == 503


def test_source_has_no_public_bind_or_fake_env_switch() -> None:
    combined = "\n".join(
        path.read_text(encoding="utf-8") for path in APP_API.glob("*.py")
    )
    assert "0.0.0.0" not in combined
    assert "PALADIN_FAKE_LLM" not in combined
    assert "FAKE_LLM" not in combined
    assert "os.getenv" not in combined
    assert "os.environ" not in combined
