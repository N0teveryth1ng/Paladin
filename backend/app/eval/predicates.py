"""Predicate grammar for the evaluation set.

This module parses and validates deterministic rubric predicates. It does not
evaluate them against an architecture graph; that is step 3's job.

Grammar
-------
    function(arg=value, arg~="string", ...)

A predicate is exactly one function call. Arguments are comma-separated and
use ``=`` for enumerated or integer values and ``~=`` for substring matches.

``parse`` returns a frozen, hashable ``Predicate``. Calling it twice with the
same input yields equal results and has no side effects.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.model.enums import ComponentType, ConnectionType, FlagKind, Severity

MAX_STRING_ARGUMENT = 80

#: Human-readable names for every component type. Used by the eval-set leak
#: guard: a prompt may not contain a type name that its own predicates use.
COMPONENT_TYPE_LABELS: dict[str, str] = {
    "client": "client",
    "api_gateway": "api gateway",
    "load_balancer": "load balancer",
    "service": "service",
    "worker": "worker",
    "database": "database",
    "cache": "cache",
    "message_queue": "message queue",
    "object_storage": "object storage",
    "cdn": "cdn",
    "auth_provider": "auth provider",
    "search_index": "search index",
    "scheduler": "scheduler",
    "external_service": "external service",
}


class PredicateError(ValueError):
    """Raised when a predicate does not match the grammar or its vocabulary."""


@dataclass(frozen=True)
class Argument:
    """One parsed argument. ``value`` is always the raw token text."""

    name: str
    operator: Literal["=", "~="]
    value: str


@dataclass(frozen=True)
class Predicate:
    """A parsed predicate. Frozen so callers cannot mutate a rubric at runtime."""

    function: str
    arguments: tuple[Argument, ...]

    def get(self, name: str) -> str:
        for argument in self.arguments:
            if argument.name == name:
                return argument.value
        raise KeyError(name)

    def has(self, name: str) -> bool:
        return any(argument.name == name for argument in self.arguments)


# function -> argument name -> value kind
_ALLOWED: dict[str, dict[str, str]] = {
    "component_exists": {"type": "component_type", "technology": "string"},
    "connection_exists": {
        "from_type": "component_type",
        "to_type": "component_type",
        "type": "connection_type",
        "label": "string",
    },
    "path_exists": {"from_type": "component_type", "to_type": "component_type"},
    "no_connection": {"from_type": "component_type", "to_type": "component_type"},
    "no_component": {"type": "component_type"},
    "group_exists": {"member_type": "component_type"},
    "no_reference_issues": {},
    "flag_present": {"kind": "flag_kind", "severity": "severity"},
    "no_flag": {"severity": "severity"},
    "assumption_present": {"text": "string"},
    "component_count": {"lte": "integer"},
}

_REQUIRED: dict[str, tuple[str, ...]] = {
    "component_exists": ("type",),
    "connection_exists": ("from_type", "to_type"),
    "path_exists": ("from_type", "to_type"),
    "no_connection": ("from_type", "to_type"),
    "no_component": ("type",),
    "group_exists": ("member_type",),
    "no_reference_issues": (),
    "flag_present": ("kind", "severity"),
    "no_flag": ("severity",),
    "assumption_present": ("text",),
    "component_count": ("lte",),
}

_ENUMS: dict[str, set[str]] = {
    "component_type": {item.value for item in ComponentType},
    "connection_type": {item.value for item in ConnectionType},
    "flag_kind": {item.value for item in FlagKind},
    "severity": {item.value for item in Severity},
}

_CALL_RE = re.compile(r"^([a-z][a-z0-9_]*)\((.*)\)$", re.DOTALL)
_ARGUMENT_RE = re.compile(r"^([a-z_][a-z0-9_]*)\s*(~=|=)\s*(.*)$")
_STRING_RE = re.compile(r'^"([^"\r\n]*)"$')
_BARE_RE = re.compile(r"^[a-z0-9_]+$")
_INTEGER_RE = re.compile(r"^[0-9]+$")


def parse(text: str) -> Predicate:
    """Parse and validate one predicate. Raise ``PredicateError`` on failure."""

    if not isinstance(text, str):
        raise PredicateError("predicate must be a string")

    match = _CALL_RE.match(text)
    if match is None:
        raise PredicateError(f"not a single function call: {text!r}")

    function = match.group(1)
    if function not in _ALLOWED:
        raise PredicateError(f"unknown function: {function!r}")

    allowed = _ALLOWED[function]
    arguments = _parse_arguments(match.group(2), function, allowed)

    seen = {argument.name for argument in arguments}
    missing = [name for name in _REQUIRED[function] if name not in seen]
    if missing:
        raise PredicateError(
            f"{function} is missing required argument(s): {', '.join(missing)}"
        )

    if function == "connection_exists" and not ({"type", "label"} & seen):
        raise PredicateError(
            "connection_exists requires at least one of 'type' or 'label~='"
        )

    return Predicate(function=function, arguments=tuple(arguments))


def _parse_arguments(
    body: str, function: str, allowed: dict[str, str]
) -> list[Argument]:
    if body.strip() == "":
        return []

    parts = _split_arguments(body)
    arguments: list[Argument] = []
    seen: set[str] = set()

    for part in parts:
        match = _ARGUMENT_RE.match(part.strip())
        if match is None:
            raise PredicateError(f"malformed argument: {part.strip()!r}")

        name, operator, raw_value = match.groups()
        if name not in allowed:
            raise PredicateError(f"unknown argument for {function}: {name!r}")
        if name in seen:
            raise PredicateError(f"duplicate argument for {function}: {name!r}")
        seen.add(name)

        kind = allowed[name]
        value = _validate_value(name, operator, raw_value.strip(), kind)
        arguments.append(Argument(name=name, operator=operator, value=value))

    return arguments


def _split_arguments(body: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    in_string = False

    for character in body:
        if character == '"':
            in_string = not in_string
            current.append(character)
        elif character == "," and not in_string:
            parts.append("".join(current))
            current = []
        else:
            current.append(character)

    if in_string:
        raise PredicateError("unbalanced quotes")
    parts.append("".join(current))
    return parts


def _validate_value(
    name: str, operator: str, raw_value: str, kind: str
) -> str:
    if kind == "string":
        if operator != "~=":
            raise PredicateError(f"argument {name!r} must use '~=' with a string")
        match = _STRING_RE.match(raw_value)
        if match is None:
            raise PredicateError(
                f"argument {name!r} must be a double-quoted string"
            )
        value = match.group(1)
        if value == "":
            raise PredicateError(f"argument {name!r} must not be empty")
        if len(value) > MAX_STRING_ARGUMENT:
            raise PredicateError(
                f"argument {name!r} exceeds {MAX_STRING_ARGUMENT} characters"
            )
        return value

    if operator != "=":
        raise PredicateError(f"argument {name!r} must use '='")

    if _BARE_RE.match(raw_value) is None:
        raise PredicateError(f"argument {name!r} has an invalid value: {raw_value!r}")

    if kind == "integer":
        if _INTEGER_RE.match(raw_value) is None:
            raise PredicateError(f"argument {name!r} must be a non-negative integer")
        return raw_value

    if raw_value not in _ENUMS[kind]:
        raise PredicateError(
            f"argument {name!r} is not a valid {kind}: {raw_value!r}"
        )
    return raw_value
