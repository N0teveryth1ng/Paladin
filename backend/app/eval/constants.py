"""The one place the evaluation bar and fixed harness settings live.

Nothing else may recompute a threshold. ``eval/freeze.json`` copies these
values, and ``test_report.py`` asserts the machine-readable block in
``eval/README.md`` matches them.
"""

from __future__ import annotations

RUNS_PER_PROMPT = 3
GATE_RUNS_REQUIRED = 2
TOTAL_PROMPTS = 15
TOTAL_RUNS = 45
MIN_PROMPTS_PASSED = 13
TOTAL_COMPLEX = 4
MIN_COMPLEX_PASSED = 4
TOTAL_ADVERSARIAL = 3
MIN_ADVERSARIAL_PASSED = 3
MIN_FIRST_ATTEMPT_SCHEMA_VALID = 41

TEMPERATURE = 0.3
TIMEOUT_S = 120
MAX_ATTEMPTS = 3
TIMEOUT_RETRIES = 1
MAX_RATE_LIMIT_WAITS = 5
BACKOFF_SECONDS = (1, 2, 4, 8, 16)

THRESHOLDS = {
    "RUNS_PER_PROMPT": RUNS_PER_PROMPT,
    "GATE_RUNS_REQUIRED": GATE_RUNS_REQUIRED,
    "TOTAL_PROMPTS": TOTAL_PROMPTS,
    "TOTAL_RUNS": TOTAL_RUNS,
    "MIN_PROMPTS_PASSED": MIN_PROMPTS_PASSED,
    "TOTAL_COMPLEX": TOTAL_COMPLEX,
    "MIN_COMPLEX_PASSED": MIN_COMPLEX_PASSED,
    "TOTAL_ADVERSARIAL": TOTAL_ADVERSARIAL,
    "MIN_ADVERSARIAL_PASSED": MIN_ADVERSARIAL_PASSED,
    "MIN_FIRST_ATTEMPT_SCHEMA_VALID": MIN_FIRST_ATTEMPT_SCHEMA_VALID,
}

SHARED_SETTINGS = {
    "TEMPERATURE": TEMPERATURE,
    "TIMEOUT_S": TIMEOUT_S,
    "MAX_ATTEMPTS": MAX_ATTEMPTS,
    "TIMEOUT_RETRIES": TIMEOUT_RETRIES,
    "MAX_RATE_LIMIT_WAITS": MAX_RATE_LIMIT_WAITS,
    "BACKOFF_SECONDS": list(BACKOFF_SECONDS),
}

ALL_VALUES = {**THRESHOLDS, **SHARED_SETTINGS}

#: Run statuses that are real results. Everything else is infrastructure.
TERMINAL_STATUSES = frozenset({"schema_valid", "schema_invalid", "timeout_failed"})
#: Infrastructure failures: excluded from every count and retried later.
INFRASTRUCTURE_STATUSES = frozenset({"rate_limited", "transport_error"})
