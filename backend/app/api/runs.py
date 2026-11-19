"""In-memory run registry: one active run, bounded history, server-side timeout.

Nothing here is written to disk. Every state transition is made under one lock;
the terminal state is written once and any late worker result is discarded.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from app.api.config import StartupBundle
from app.api.generation import INTERNAL_MESSAGE, generate_and_validate

ACTIVE_STATES = frozenset({"queued", "running"})
TERMINAL_STATES = frozenset({"succeeded", "failed", "timeout"})
MAX_RETAINED_RUNS = 10
WATCHDOG_INTERVAL_S = 0.5

RUN_TIMEOUT_MESSAGE = (
    "The run exceeded its maximum allowed time. No diagram was changed."
)


class RunInProgress(RuntimeError):
    """A second submit while a run is active."""


class Clock:
    """Monotonic time source, overridable in offline tests."""

    def monotonic(self) -> float:
        return time.monotonic()

    def now(self) -> datetime:
        return datetime.now(timezone.utc)


@dataclass
class RunRecord:
    run_id: str
    prompt: str
    state: str
    started_at: str
    started_monotonic: float
    max_run_seconds: int
    seq: int
    result: dict[str, Any] | None = None
    error: dict[str, str] | None = None
    finished_monotonic: float | None = None


class RunRegistry:
    def __init__(self, bundle: StartupBundle | None, clock: Clock | None = None):
        self._bundle = bundle
        self._clock = clock if clock is not None else Clock()
        self._lock = threading.Lock()
        self._runs: dict[str, RunRecord] = {}
        self._next_seq = 0
        self._last_started: datetime | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # -- creation and lookup -------------------------------------------

    def create(
        self, prompt: str, client_factory: Callable[[], Any]
    ) -> dict[str, Any]:
        with self._lock:
            if any(record.state in ACTIVE_STATES for record in self._runs.values()):
                raise RunInProgress("a run is already in progress")

            now = self._clock.now()
            if self._last_started is not None and now <= self._last_started:
                now = self._last_started + timedelta(microseconds=1)
            self._last_started = now

            run_id = uuid.uuid4().hex
            seq = self._next_seq
            self._next_seq += 1
            record = RunRecord(
                run_id=run_id,
                prompt=prompt,
                state="queued",
                started_at=now.isoformat(),
                started_monotonic=self._clock.monotonic(),
                max_run_seconds=0 if self._bundle is None else self._bundle.max_run_seconds,
                seq=seq,
            )
            self._runs[run_id] = record
            self._evict_locked()
            snapshot = self._snapshot(record)

        thread = threading.Thread(
            target=self._worker,
            args=(run_id, client_factory),
            name=f"paladin-run-{run_id[:8]}",
            daemon=True,
        )
        thread.start()
        return snapshot

    def get(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._runs.get(run_id)
            if record is None:
                return None
            self._check_timeout_locked(record)
            return self._snapshot(record)

    def active_count(self) -> int:
        with self._lock:
            return sum(1 for record in self._runs.values() if record.state in ACTIVE_STATES)

    def size(self) -> int:
        with self._lock:
            return len(self._runs)

    # -- internals ------------------------------------------------------

    def _evict_locked(self) -> None:
        while len(self._runs) > MAX_RETAINED_RUNS:
            terminal = [
                record for record in self._runs.values() if record.state in TERMINAL_STATES
            ]
            if not terminal:
                break
            oldest = min(terminal, key=lambda record: record.seq)
            del self._runs[oldest.run_id]

    def _elapsed_ms(self, record: RunRecord) -> int:
        end = (
            record.finished_monotonic
            if record.finished_monotonic is not None
            else self._clock.monotonic()
        )
        return max(0, int((end - record.started_monotonic) * 1000))

    def _finish_locked(
        self,
        record: RunRecord,
        state: str,
        *,
        result: dict[str, Any] | None = None,
        error: dict[str, str] | None = None,
    ) -> bool:
        """Write a terminal state once. Returns False if already terminal."""

        if record.state not in ACTIVE_STATES:
            return False
        record.state = state
        record.result = result
        record.error = error
        record.finished_monotonic = self._clock.monotonic()
        return True

    def _check_timeout_locked(self, record: RunRecord) -> None:
        if (
            record.state in ACTIVE_STATES
            and self._elapsed_ms(record) > record.max_run_seconds * 1000
        ):
            self._finish_locked(
                record,
                "timeout",
                error={"code": "run_timeout", "message": RUN_TIMEOUT_MESSAGE},
            )

    def _snapshot(self, record: RunRecord) -> dict[str, Any]:
        return {
            "run_id": record.run_id,
            "state": record.state,
            "elapsed_ms": self._elapsed_ms(record),
            "max_run_seconds": record.max_run_seconds,
            "started_at": record.started_at,
            "result": record.result,
            "error": dict(record.error) if record.error is not None else None,
        }

    def _worker(self, run_id: str, client_factory: Callable[[], Any]) -> None:
        try:
            with self._lock:
                record = self._runs.get(run_id)
                if record is None or record.state != "queued" or self._bundle is None:
                    return
                record.state = "running"

            client = client_factory()
            outcome = generate_and_validate(
                prompt=record.prompt,
                config=self._bundle.config,
                reasoning_transform=self._bundle.reasoning_transform,
                client=client,
            )

            with self._lock:
                current = self._runs.get(run_id)
                if current is None:
                    return
                if outcome.status == "succeeded" and outcome.result is not None:
                    self._finish_locked(
                        current,
                        "succeeded",
                        result=outcome.result.model_dump(mode="json"),
                    )
                else:
                    self._finish_locked(
                        current,
                        "failed",
                        error=outcome.error
                        or {"code": "internal_error", "message": INTERNAL_MESSAGE},
                    )
        except Exception:
            with self._lock:
                current = self._runs.get(run_id)
                if current is not None:
                    self._finish_locked(
                        current,
                        "failed",
                        error={"code": "internal_error", "message": INTERNAL_MESSAGE},
                    )

    # -- watchdog -------------------------------------------------------

    def start_watchdog(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._watchdog, name="paladin-watchdog", daemon=True
        )
        self._thread.start()

    def stop_watchdog(self) -> None:
        self._stop.set()

    def _watchdog(self) -> None:
        while not self._stop.wait(WATCHDOG_INTERVAL_S):
            with self._lock:
                for record in list(self._runs.values()):
                    self._check_timeout_locked(record)
