"""One OpenAI-compatible chat client, built on the standard library.

There is no provider branching: the base URL is configuration. Only
``message.content`` is read; ``reasoning_content`` and any other message field
are ignored. The ``Authorization`` header is never logged.
"""

from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Sequence

REDACTED = "***"


class LLMError(RuntimeError):
    """Base class for provider failures."""


class RateLimitedError(LLMError):
    """HTTP 429. Infrastructure, never a model failure."""


class LLMTimeoutError(LLMError):
    """The request exceeded its timeout."""


class TransportError(LLMError):
    """Any other transport or protocol failure."""


@dataclass(frozen=True)
class Completion:
    text: str
    usage: dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0.0
    finish_reason: str | None = None


class ChatClient:
    def __init__(self, base_url: str, api_key: str, model: str, timeout_s: int = 120):
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.model = model
        self.timeout_s = timeout_s

    def __repr__(self) -> str:
        return (
            f"ChatClient(base_url={self.base_url!r}, api_key={REDACTED!r}, "
            f"model={self.model!r})"
        )

    def __str__(self) -> str:
        return self.__repr__()

    # -- requests -------------------------------------------------------

    def _request(
        self, path: str, *, payload: dict[str, Any] | None, timeout_s: int
    ) -> tuple[Any, float]:
        url = f"{self.base_url}{path}"
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            method="GET" if payload is None else "POST",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )

        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            if error.code == 429:
                raise RateLimitedError("provider returned HTTP 429") from None
            raise TransportError(f"provider returned HTTP {error.code}") from None
        except (TimeoutError, socket.timeout):
            raise LLMTimeoutError("provider request timed out") from None
        except urllib.error.URLError as error:
            reason = error.reason
            if isinstance(reason, (TimeoutError, socket.timeout)):
                raise LLMTimeoutError("provider request timed out") from None
            raise TransportError("provider request failed at the transport layer") from None
        latency_ms = (time.perf_counter() - started) * 1000.0

        try:
            return json.loads(body), latency_ms
        except json.JSONDecodeError:
            raise TransportError("provider returned a non-JSON response") from None

    # -- API ------------------------------------------------------------

    def complete(
        self,
        messages: Sequence[dict[str, str]],
        *,
        temperature: float,
        max_tokens: int,
        response_format: dict[str, Any] | None = None,
        timeout_s: int | None = None,
    ) -> Completion:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            payload["response_format"] = response_format

        data, latency_ms = self._request(
            "/chat/completions",
            payload=payload,
            timeout_s=self.timeout_s if timeout_s is None else timeout_s,
        )

        choices = data.get("choices") if isinstance(data, dict) else None
        if not choices:
            raise TransportError("provider returned no choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            raise TransportError("provider response has no message.content")

        return Completion(
            text=content,
            usage=data.get("usage") or {},
            latency_ms=latency_ms,
            finish_reason=choices[0].get("finish_reason"),
        )

    def list_models(self, timeout_s: int | None = None) -> list[dict[str, Any]]:
        """List models from ``/models``. Scratch phase only."""

        data, _ = self._request(
            "/models",
            payload=None,
            timeout_s=self.timeout_s if timeout_s is None else timeout_s,
        )
        entries = data.get("data") if isinstance(data, dict) else None
        if not isinstance(entries, list):
            raise TransportError("provider returned no model list")
        return [entry for entry in entries if isinstance(entry, dict)]
