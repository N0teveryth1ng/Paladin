"""Test-only fake-injected backend launcher for the step 6 screenshots.

Run from ``D:/Paladin/backend``::

    python -m tests.fixtures.api.launcher --scenario <name>

Scenarios: ``running``, ``issues``, ``blocking``, ``rate_limited``.

This module lives under ``tests/`` and is never imported by ``backend/app``.
The committed ``eval/freeze.json`` has no ``selected_model``; the launcher makes
a deep in-memory copy, adds only that one key (naming an existing entry in
``models``), and builds a ``StartupBundle`` from the shared ``app.api.config``
helpers. No file is written and no provider credentials or network calls are
used: a fake client is injected through ``create_app(client_factory=...)``.
"""

from __future__ import annotations

import argparse
import copy
import json
import threading
from collections.abc import Sequence
from typing import Any

import uvicorn

from app.api import config as api_config
from app.api.config import StartupBundle
from app.api.main import create_app
from app.llm.client import Completion, RateLimitedError
from app.llm.system_prompt import SYSTEM_PROMPT_VERSION, load_system_prompt
from app.validation.rules import load_rules
from tests.fixtures.api.fake_client import FakeClient, factory_for

HOST = "127.0.0.1"
PORT = 8000
MODEL = "nemotron-3.5-super-vl"
SCENARIOS = ("running", "issues", "blocking", "rate_limited")

RATE_LIMIT_ERROR = "HTTP 429 (test-only): free-model daily limit reached"


def build_bundle() -> StartupBundle:
    """Return a StartupBundle built from a synthetic in-memory freeze copy.

    Only ``selected_model`` is added to the deep copy; every hashed and shared
    setting is left untouched. This mirrors ``startup_check`` using the config
    helpers, but without writing a freeze file or reading provider settings.
    """

    original = api_config.load_freeze()
    freeze = copy.deepcopy(original)
    freeze["selected_model"] = MODEL

    added = set(freeze) - set(original)
    changed = {key for key in original if original[key] != freeze[key]}
    if added != {"selected_model"} or changed:
        raise RuntimeError("synthetic freeze must only add selected_model")

    selected = api_config.selected_model_name(freeze)
    api_config.verify_system_prompt_hash(freeze)
    model_entry = freeze["models"][selected]
    schema = json.loads(api_config.DEFAULT_SCHEMA.read_text(encoding="utf-8"))
    system_prompt = load_system_prompt()

    return StartupBundle(
        freeze=freeze,
        selected_model=selected,
        config=api_config.build_generation_config(
            freeze, model_entry, system_prompt, schema
        ),
        reasoning_transform=api_config.resolve_reasoning_transform(freeze),
        max_run_seconds=api_config.derive_max_run_seconds(freeze),
        system_prompt_version=SYSTEM_PROMPT_VERSION,
        rules_version=load_rules().rules_version,
    )


class BlockingClient:
    """A client whose ``complete`` never returns until explicitly released.

    Used by the ``running`` scenario so the run stays in ``running`` state for
    as long as the screenshot needs. There is no sleep and no provider call:
    the worker waits on a threading.Event and is released on shutdown.
    """

    def __init__(self) -> None:
        self.started = threading.Event()
        self._release = threading.Event()

    def complete(self, messages: Sequence[dict[str, str]], **kwargs: Any) -> Completion:
        self.started.set()
        self._release.wait()
        raise AssertionError("BlockingClient was released before process exit")

    def release(self) -> None:
        self._release.set()


def client_for(scenario: str) -> Any:
    """Build the fake client for a scenario; never construct a real client."""

    if scenario == "running":
        return BlockingClient()
    if scenario == "rate_limited":
        return FakeClient([RateLimitedError(RATE_LIMIT_ERROR)])
    if scenario == "issues":
        return FakeClient.from_fixture("issues.json")
    if scenario == "blocking":
        return FakeClient.from_fixture("blocking.json")
    raise ValueError(f"unknown scenario: {scenario!r}")


class ReadyServer(uvicorn.Server):
    """A uvicorn server that prints a diagnostic line once it is serving.

    ``uvicorn.Server.run`` installs handlers for SIGINT, SIGTERM and SIGBREAK,
    so a signal sets ``should_exit`` and the loopback socket is closed on exit.
    """

    def __init__(self, config: uvicorn.Config, *, scenario: str) -> None:
        super().__init__(config)
        self._scenario = scenario

    async def startup(self, sockets: list[Any] | None = None) -> None:
        await super().startup(sockets)
        print(
            f"READY scenario={self._scenario} url=http://{HOST}:{PORT} "
            f"selected_model={MODEL}",
            flush=True,
        )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=SCENARIOS, required=True)
    args = parser.parse_args(argv)

    bundle = build_bundle()
    client = client_for(args.scenario)
    app = create_app(bundle=bundle, client_factory=factory_for(client))
    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        workers=1,
        reload=False,
        log_level="warning",
    )
    server = ReadyServer(config, scenario=args.scenario)
    try:
        server.run()
    finally:
        if isinstance(client, BlockingClient):
            client.release()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
