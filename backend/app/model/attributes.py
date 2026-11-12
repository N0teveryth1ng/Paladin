"""Validation for the free-form attribute map.

Attributes stay `dict[str, str]` in v1: per-type typed property models are a
14-way expansion that free models fail. Three reserved keys are validated by
value shape only. Reserved keys are global to the model and are deliberately
not scoped by component type; type-fit checks belong to step 4 as soft issues.
"""

from __future__ import annotations

import re
from typing import Final

MAX_ATTRIBUTES: Final = 12
MAX_KEY_LEN: Final = 40
MAX_VALUE_LEN: Final = 200

KEY_PATTERN: Final = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
REPLICAS_PATTERN: Final = re.compile(r"^[0-9]{1,4}$")

PROTOCOLS: Final = frozenset(
    {"http", "https", "grpc", "websocket", "tcp", "sql", "amqp", "other"}
)
CONSISTENCY_MODELS: Final = frozenset({"strong", "eventual", "causal", "not_applicable"})

RESERVED_KEYS: Final = ("replicas", "protocol", "consistency")

ATTRIBUTES_DESCRIPTION: Final = (
    "Free-form string map, at most 12 entries. Reserved keys are validated: "
    "'replicas' must be a non-negative integer string; "
    "'protocol' must be one of http, https, grpc, websocket, tcp, sql, amqp, other; "
    "'consistency' must be one of strong, eventual, causal, not_applicable. "
    "All other keys are free-form, lowercase snake_case."
)


def validate_attributes(attributes: dict[str, str]) -> dict[str, str]:
    """Validate an attribute map. Raises ValueError on the first violation."""

    if len(attributes) > MAX_ATTRIBUTES:
        raise ValueError(f"attributes may contain at most {MAX_ATTRIBUTES} entries")

    for key, value in attributes.items():
        if not KEY_PATTERN.fullmatch(key):
            raise ValueError(
                f"attribute key {key!r} must be lowercase snake_case starting with a letter "
                f"(max {MAX_KEY_LEN} characters)"
            )
        if len(value) > MAX_VALUE_LEN:
            raise ValueError(
                f"attribute {key!r} value exceeds {MAX_VALUE_LEN} characters"
            )

    if "replicas" in attributes:
        value = attributes["replicas"]
        if not REPLICAS_PATTERN.fullmatch(value):
            raise ValueError(
                f"attribute 'replicas' must be a non-negative integer string, got {value!r}"
            )

    if "protocol" in attributes:
        value = attributes["protocol"]
        if value not in PROTOCOLS:
            raise ValueError(
                f"attribute 'protocol' must be one of {sorted(PROTOCOLS)}, got {value!r}"
            )

    if "consistency" in attributes:
        value = attributes["consistency"]
        if value not in CONSISTENCY_MODELS:
            raise ValueError(
                f"attribute 'consistency' must be one of {sorted(CONSISTENCY_MODELS)}, got {value!r}"
            )

    return attributes
