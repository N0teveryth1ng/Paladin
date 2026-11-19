"""Regression tests for the test-only step 6 screenshot launcher."""

from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from app.api.config import StartupBundle
from app.llm.client import RateLimitedError
from app.model.architecture import ArchitectureDraft
from app.validation.validators import validate_graph
from tests.fixtures.api.launcher import (
    MODEL,
    BlockingClient,
    build_bundle,
    client_for,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
COMMITTED_FREEZE = REPO_ROOT / "eval" / "freeze.json"


def test_build_bundle_only_adds_selected_model_in_memory() -> None:
    before_bytes = COMMITTED_FREEZE.read_bytes()
    original = json.loads(before_bytes.decode("utf-8"))

    bundle = build_bundle()

    assert isinstance(bundle, StartupBundle)
    assert bundle.selected_model == MODEL
    assert "selected_model" not in original
    assert set(bundle.freeze) - set(original) == {"selected_model"}
    assert {key for key in original if original[key] != bundle.freeze[key]} == set()
    assert bundle.freeze["shared_settings"] == original["shared_settings"]
    assert bundle.freeze["system_prompt_sha256"] == original["system_prompt_sha256"]
    assert bundle.max_run_seconds == 1500
    assert COMMITTED_FREEZE.read_bytes() == before_bytes


@pytest.mark.parametrize(
    ("scenario", "expect_issue", "expect_blocking"),
    [
        ("issues", True, False),
        ("blocking", False, True),
    ],
)
def test_draft_scenarios(
    scenario: str, expect_issue: bool, expect_blocking: bool
) -> None:
    completion = client_for(scenario).complete([], temperature=0.3, max_tokens=1)
    draft = ArchitectureDraft.model_validate(json.loads(completion.text))
    issues = validate_graph(draft)
    blocking = [
        flag
        for flag in draft.flags
        if flag.severity.value == "blocking" and flag.resolved_by is None
    ]

    assert bool(issues) is expect_issue
    assert bool(blocking) is expect_blocking


def test_rate_limited_scenario_raises_rate_limited_error() -> None:
    client = client_for("rate_limited")
    with pytest.raises(RateLimitedError):
        client.complete([], temperature=0.3, max_tokens=1)


def test_running_scenario_blocks_until_released() -> None:
    client = client_for("running")
    assert isinstance(client, BlockingClient)
    errors: list[AssertionError] = []

    def call() -> None:
        try:
            client.complete([], temperature=0.3, max_tokens=1)
        except AssertionError as error:
            errors.append(error)

    thread = threading.Thread(target=call, daemon=True)
    thread.start()
    try:
        assert client.started.wait(timeout=2)
        assert thread.is_alive()
    finally:
        client.release()
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert len(errors) == 1
