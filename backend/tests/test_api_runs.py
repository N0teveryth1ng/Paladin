"""Run creation, single-active-run rule, polling, retention and body limits."""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.config import startup_check
from app.api.main import create_app, get_client_factory
from app.api.runs import Clock
from app.llm.client import Completion
from tests.fixtures.api.fake_client import factory_for, success_draft

REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL = "nemotron-3.5-super-vl"
TERMINAL = {"succeeded", "failed", "timeout"}


class GatedClient:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()

    def complete(self, messages, **kwargs) -> Completion:
        self.started.set()
        assert self.release.wait(timeout=5), "gate was not released"
        return Completion(text=json.dumps(success_draft()), finish_reason="stop")


class ManualClock(Clock):
    def __init__(self) -> None:
        self.monotonic_value = 1000.0

    def monotonic(self) -> float:
        return self.monotonic_value

    def now(self) -> datetime:
        return datetime(2026, 11, 19, 12, 0, 0, tzinfo=timezone.utc)


def app_with(bundle, client, *, clock: Clock | None = None):
    app = create_app(bundle=bundle, clock=clock)
    app.dependency_overrides[get_client_factory] = lambda: factory_for(client)
    return app


def make_bundle(tmp_path: Path):
    payload = json.loads((REPO_ROOT / "eval" / "freeze.json").read_text())
    payload["selected_model"] = MODEL
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return startup_check(path)


def wait_terminal(client: TestClient, run_id: str, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/runs/{run_id}").json()
        if body["state"] in TERMINAL:
            return body
        time.sleep(0.005)
    raise AssertionError(f"run {run_id} did not reach a terminal state")


def test_valid_post_returns_202_with_run_id(tmp_path: Path) -> None:
    gated = GatedClient()
    app = app_with(make_bundle(tmp_path), gated)
    with TestClient(app) as client:
        try:
            response = client.post("/api/runs", json={"prompt": "Design a URL shortener."})
            assert response.status_code == 202
            body = response.json()
            assert body["run_id"]
            assert body["state"] == "running"
            assert body["started_at"]
            assert body["max_run_seconds"] == 1500
            assert gated.started.wait(timeout=5)
        finally:
            gated.release.set()


def test_second_post_while_active_returns_409(tmp_path: Path) -> None:
    gated = GatedClient()
    app = app_with(make_bundle(tmp_path), gated)
    with TestClient(app) as client:
        try:
            first = client.post("/api/runs", json={"prompt": "first"})
            assert first.status_code == 202
            assert gated.started.wait(timeout=5)
            second = client.post("/api/runs", json={"prompt": "second"})
            assert second.status_code == 409
            assert second.json()["error"]["code"] == "run_in_progress"
        finally:
            gated.release.set()


def test_unknown_run_returns_404(tmp_path: Path) -> None:
    app = create_app(bundle=make_bundle(tmp_path))
    with TestClient(app) as client:
        response = client.get("/api/runs/no-such-run")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_running_poll_reports_increasing_elapsed_ms(tmp_path: Path) -> None:
    gated = GatedClient()
    clock = ManualClock()
    app = app_with(make_bundle(tmp_path), gated, clock=clock)
    with TestClient(app) as client:
        try:
            created = client.post("/api/runs", json={"prompt": "poll me"}).json()
            assert gated.started.wait(timeout=5)
            first = client.get(f"/api/runs/{created['run_id']}").json()
            clock.monotonic_value += 1.25
            second = client.get(f"/api/runs/{created['run_id']}").json()
            assert first["state"] == "running"
            assert second["state"] == "running"
            assert second["elapsed_ms"] > first["elapsed_ms"]
            assert second["max_run_seconds"] == 1500
        finally:
            gated.release.set()


def test_terminal_run_is_retained_then_evicted_at_limit(tmp_path: Path) -> None:
    from tests.fixtures.api.fake_client import FakeClient

    bundle = make_bundle(tmp_path)
    registry = create_app(bundle=bundle).state.registry
    run_ids: list[str] = []
    for _ in range(12):
        snapshot = registry.create("prompt", factory_for(FakeClient()))
        run_ids.append(snapshot["run_id"])
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            body = registry.get(snapshot["run_id"])
            if body["state"] in TERMINAL:
                break
            time.sleep(0.005)

    assert registry.size() == 10
    assert registry.get(run_ids[0]) is None
    assert registry.get(run_ids[1]) is None
    retained = registry.get(run_ids[2])
    assert retained is not None and retained["state"] == "succeeded"


def test_oversized_body_and_empty_prompt_return_400(tmp_path: Path) -> None:
    app = create_app(bundle=make_bundle(tmp_path))
    with TestClient(app) as client:
        huge = client.post("/api/runs", json={"prompt": "x" * 17000})
        empty = client.post("/api/runs", json={"prompt": ""})
        non_string = client.post("/api/runs", json={"prompt": 123})

    assert huge.status_code == 400
    assert empty.status_code == 400
    assert non_string.status_code == 400
