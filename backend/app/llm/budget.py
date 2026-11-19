"""Hard per-invocation call caps and a 429 stop signal.

A failing model must not be able to drain the provider's daily free-model
allowance. Every call goes through ``BudgetedClient``; when the cap is reached
the run stops and can be resumed later. A 429 is never retried: ``generate``
returns ``rate_limited`` and the runner stops.
"""

from __future__ import annotations

from typing import Any


class BudgetExhausted(RuntimeError):
    """The per-invocation call cap was reached. Resume later; not a failure."""


class BudgetedClient:
    """Count every provider call and refuse the call after ``max_calls``."""

    def __init__(self, client: Any, max_calls: int):
        if max_calls < 1:
            raise ValueError("max_calls must be at least 1")
        self._client = client
        self.max_calls = max_calls
        self.calls = 0

    @property
    def base_url(self) -> str:
        return getattr(self._client, "base_url", "")

    @property
    def model(self) -> str:
        return getattr(self._client, "model", "")

    @property
    def remaining(self) -> int:
        return max(self.max_calls - self.calls, 0)

    def complete(self, *args: Any, **kwargs: Any) -> Any:
        if self.calls >= self.max_calls:
            raise BudgetExhausted(
                f"call budget exhausted: {self.calls}/{self.max_calls} calls"
            )
        self.calls += 1
        return self._client.complete(*args, **kwargs)
