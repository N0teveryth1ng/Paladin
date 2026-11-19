"""Deterministic client double used only by backend tests.

This module lives under ``tests/`` and is never imported by ``backend/app``.
It implements the ``complete`` interface that ``app.llm.generate`` calls and can
raise the same LLM exception classes as the real client.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Sequence

from app.llm.client import Completion

FIXTURE_DIR = Path(__file__).resolve().parent


def _read(name: str) -> Any:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def success_draft() -> dict[str, Any]:
    return _read("success.json")


def malformed_draft() -> dict[str, Any]:
    return _read("malformed.json")


def schema_invalid_then_valid_steps() -> list[Any]:
    payload = _read("schema_invalid_then_valid.json")
    return [
        item if isinstance(item, str) else json.dumps(item)
        for item in payload["responses"]
    ]


class FakeClient:
    """A scripted client. Each step is text, a draft dict or an exception."""

    def __init__(self, steps: Sequence[Any] | None = None):
        self._steps: list[Any] = list(steps) if steps is not None else [
            json.dumps(success_draft())
        ]
        self.calls = 0
        self.messages: list[list[dict[str, str]]] = []
        self.kwargs: list[dict[str, Any]] = []

    @classmethod
    def from_fixture(cls, name: str) -> "FakeClient":
        if name == "schema_invalid_then_valid.json":
            return cls(schema_invalid_then_valid_steps())
        return cls([json.dumps(_read(name))])

    def complete(
        self,
        messages: Sequence[dict[str, str]],
        *,
        temperature: float,
        max_tokens: int,
        response_format: dict[str, Any] | None = None,
        reasoning: dict[str, Any] | None = None,
        timeout_s: int | None = None,
    ) -> Completion:
        self.calls += 1
        self.messages.append([dict(message) for message in messages])
        self.kwargs.append(
            {
                "temperature": temperature,
                "max_tokens": max_tokens,
                "response_format": response_format,
                "reasoning": reasoning,
                "timeout_s": timeout_s,
            }
        )
        if not self._steps:
            raise AssertionError("FakeClient script exhausted")
        step = self._steps.pop(0)
        if isinstance(step, BaseException):
            raise step
        if isinstance(step, Completion):
            return step
        if isinstance(step, dict):
            return Completion(text=json.dumps(step), finish_reason="stop")
        return Completion(text=str(step), finish_reason="stop")


def factory_for(client: FakeClient) -> Callable[[], FakeClient]:
    """Return a client factory suitable for dependency injection."""

    def factory() -> FakeClient:
        return client

    return factory
