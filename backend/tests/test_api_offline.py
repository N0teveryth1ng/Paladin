"""Offline end-to-end runs with injected fakes; no provider call is made."""

from __future__ import annotations

import importlib.util
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api.generation as generation_module
from app.api.config import startup_check
from app.api.main import create_app, get_client_factory
from app.api.runs import Clock
from app.llm.client import ChatClient, Completion, LLMTimeoutError, RateLimitedError
from app.model.architecture import ArchitectureDraft
from app.validation.validators import validate_graph
from tests.fixtures.api.fake_client import (
    FakeClient,
    factory_for,
    malformed_draft,
    success_draft,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = REPO_ROOT / "backend" / "app"
MODEL = "nemotron-3.5-super-vl"
TERMINAL = {"succeeded", "failed", "timeout"}


def bundle(tmp_path: Path):
    payload = json.loads((REPO_ROOT / "eval" / "freeze.json").read_text())
    payload["selected_model"] = MODEL
    path = tmp_path / "freeze.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return startup_check(path)


class ManualClock(Clock):
    def __init__(self) -> None:
        self.monotonic_value = 1000.0

    def monotonic(self) -> float:
        return self.monotonic_value

    def now(self) -> datetime:
        return datetime(2026, 11, 19, 12, 0, 0, tzinfo=timezone.utc)


class BlockingFake(FakeClient):
    def __init__(self, *, block: bool = False) -> None:
        super().__init__([])
        self.block = block
        self.started = threading.Event()
        self.release = threading.Event()
        self.finished = threading.Event()

    def complete(self, messages, **kwargs) -> Completion:
        self.calls += 1
        self.messages.append([dict(message) for message in messages])
        self.started.set()
        if self.block:
            assert self.release.wait(timeout=5), "fake was not released"
        result = Completion(text=json.dumps(success_draft()), finish_reason="stop")
        self.finished.set()
        return result


def app_with(client: FakeClient, tmp_path: Path, *, clock: Clock | None = None):
    app = create_app(bundle=bundle(tmp_path), clock=clock)
    app.dependency_overrides[get_client_factory] = lambda: factory_for(client)
    return app


def wait_terminal(app, run_id: str, timeout: float = 5.0) -> dict:
    registry = app.state.registry
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = registry.get(run_id)
        if body["state"] in TERMINAL:
            return body
        time.sleep(0.005)
    raise AssertionError(f"run {run_id} did not reach a terminal state")


def submit(client: TestClient, prompt: str = "Design a URL shortener.") -> str:
    response = client.post("/api/runs", json={"prompt": prompt})
    assert response.status_code == 202, response.text
    return response.json()["run_id"]


def test_success_returns_exact_draft_and_validator_issues(tmp_path: Path) -> None:
    fake = FakeClient()
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        body = wait_terminal(app, run_id)
        response = client.get(f"/api/runs/{run_id}")

    expected = success_draft()
    result = response.json()["result"]
    assert body["state"] == "succeeded"
    assert result["draft"] == expected
    assert result["rules_version"] == "1.1"
    expected_issues = validate_graph(ArchitectureDraft.model_validate(expected))
    assert result["issues"] == [issue.model_dump(mode="json") for issue in expected_issues]


def test_schema_invalid_then_valid_succeeds_in_two_attempts(tmp_path: Path) -> None:
    fake = FakeClient.from_fixture("schema_invalid_then_valid.json")
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        body = wait_terminal(app, run_id)

    assert body["state"] == "succeeded"
    assert fake.calls == 2
    assert body["result"]["draft"]["title"] == "URL Shortener"


def test_rate_limited_is_not_retried(tmp_path: Path) -> None:
    fake = FakeClient([RateLimitedError("provider returned HTTP 429")])
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        body = wait_terminal(app, run_id)
        response = client.get(f"/api/runs/{run_id}")

    assert body["state"] == "failed"
    assert body["error"]["code"] == "rate_limited"
    assert response.json()["result"] is None
    assert fake.calls == 1
    assert (
        body["error"]["message"]
        == "Free-model daily limit reached (HTTP 429). No retry was made. "
        "Try again after the daily reset at 00:00 UTC."
    )


def test_provider_timeout_follows_timeout_retries(tmp_path: Path) -> None:
    from app.eval.constants import TIMEOUT_RETRIES

    fake = FakeClient([LLMTimeoutError("timed out")] * 10)
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        body = wait_terminal(app, run_id)

    assert body["state"] == "failed"
    assert body["error"]["code"] == "provider_timeout"
    assert fake.calls == TIMEOUT_RETRIES + 1


def test_server_run_timeout_discards_late_result(tmp_path: Path) -> None:
    fake = BlockingFake(block=True)
    clock = ManualClock()
    app = app_with(fake, tmp_path, clock=clock)
    with TestClient(app) as client:
        run_id = submit(client)
        assert fake.started.wait(timeout=5)
        clock.monotonic_value += 1501.0
        timed_out = client.get(f"/api/runs/{run_id}").json()
        assert timed_out["state"] == "timeout"
        assert timed_out["error"]["code"] == "run_timeout"
        fake.release.set()
        assert fake.finished.wait(timeout=5)
        late = client.get(f"/api/runs/{run_id}").json()

    assert late["state"] == "timeout"
    assert late["result"] is None
    assert late["error"]["code"] == "run_timeout"


def test_malformed_draft_is_returned_unchanged_with_issues(tmp_path: Path) -> None:
    draft = malformed_draft()
    fake = FakeClient([json.dumps(draft)])
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        body = wait_terminal(app, run_id)
        response = client.get(f"/api/runs/{run_id}")

    result = response.json()["result"]
    assert response.json()["state"] == "succeeded"
    assert result["draft"] == draft
    kinds = {issue["kind"] for issue in result["issues"]}
    assert {"component_in_multiple_groups", "synchronous_cycle"} <= kinds


def test_validator_issues_never_enter_generation_or_retries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[int] = []
    real_validate = generation_module.validate_graph

    def counted(*args, **kwargs):
        calls.append(1)
        return real_validate(*args, **kwargs)

    monkeypatch.setattr(generation_module, "validate_graph", counted)

    fake = FakeClient()
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        wait_terminal(app, run_id)
        client.get(f"/api/runs/{run_id}")

    assert calls == [1]
    assert fake.calls == 1

    issues_fake = FakeClient([json.dumps(malformed_draft())])
    issues_app = app_with(issues_fake, tmp_path)
    with TestClient(issues_app) as issues_client:
        issues_id = submit(issues_client)
        wait_terminal(issues_app, issues_id)
        issues_result = issues_client.get(f"/api/runs/{issues_id}").json()["result"]
    issue_messages = [issue["message"] for issue in issues_result["issues"]]
    assert issue_messages
    all_generation_text = json.dumps(issues_fake.messages)
    for message in issue_messages:
        assert message not in all_generation_text

    assert calls == [1, 1]
    calls.clear()
    invalid = FakeClient(["{not json"] * 3)
    invalid_app = app_with(invalid, tmp_path)
    with TestClient(invalid_app) as client:
        invalid_id = submit(client)
        failed = wait_terminal(invalid_app, invalid_id)
    assert failed["state"] == "failed"
    assert failed["error"]["code"] == "schema_invalid"
    assert calls == []
    assert len(failed["error"]["message"]) <= 800


def test_injection_is_the_only_fake_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    def refuse_init(self, *args, **kwargs) -> None:
        raise AssertionError("ChatClient must not be constructed in offline tests")

    monkeypatch.setattr(ChatClient, "__init__", refuse_init)

    fake = FakeClient()
    app = app_with(fake, tmp_path)
    with TestClient(app) as client:
        run_id = submit(client)
        body = wait_terminal(app, run_id)
    assert body["state"] == "succeeded"

    assert importlib.util.find_spec("app.api.fake_client") is None
    for source in (APP_ROOT / "api").glob("*.py"):
        text = source.read_text(encoding="utf-8")
        assert "PALADIN_FAKE_LLM" not in text
        assert "tests.fixtures" not in text
