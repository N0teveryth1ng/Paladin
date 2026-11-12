"""Evaluate the frozen deterministic rubric against an ``ArchitectureDraft``.

The grammar lives in ``app.eval.predicates``. This module is the only place a
predicate becomes a boolean. No graph library is used or needed.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Iterable

from app.eval.models import EvalPrompt
from app.eval.predicates import Predicate, parse
from app.model.architecture import ArchitectureDraft
from app.model.enums import ComponentType, Severity


@dataclass(frozen=True)
class GateResult:
    passed: bool
    failed_items: tuple[str, ...]
    blocking_flag_rule: str

    def to_record(self) -> dict:
        return {
            "passed": self.passed,
            "failed_items": list(self.failed_items),
            "blocking_flag_rule": self.blocking_flag_rule,
        }


def _by_type(draft: ArchitectureDraft) -> dict[ComponentType, list]:
    index: dict[ComponentType, list] = {}
    for component in draft.components:
        index.setdefault(component.type, []).append(component)
    return index


def _ids(components: Iterable) -> set[str]:
    return {component.id for component in components}


def _contains(value: str | None, needle: str) -> bool:
    return value is not None and needle.lower() in value.lower()


def _component_exists(predicate: Predicate, draft: ArchitectureDraft) -> bool:
    component_type = ComponentType(predicate.get("type"))
    matches = _by_type(draft).get(component_type, [])
    if predicate.has("technology"):
        needle = predicate.get("technology")
        return any(_contains(component.technology, needle) for component in matches)
    return bool(matches)


def _connection_exists(predicate: Predicate, draft: ArchitectureDraft) -> bool:
    by_type = _by_type(draft)
    sources = _ids(by_type.get(ComponentType(predicate.get("from_type")), []))
    targets = _ids(by_type.get(ComponentType(predicate.get("to_type")), []))

    for connection in draft.connections:
        if connection.from_ not in sources or connection.to not in targets:
            continue
        if predicate.has("type") and connection.type.value != predicate.get("type"):
            continue
        if predicate.has("label") and not _contains(connection.label, predicate.get("label")):
            continue
        return True
    return False


def _path_exists(predicate: Predicate, draft: ArchitectureDraft) -> bool:
    by_type = _by_type(draft)
    starts = _ids(by_type.get(ComponentType(predicate.get("from_type")), []))
    goals = _ids(by_type.get(ComponentType(predicate.get("to_type")), []))
    if not starts or not goals:
        return False

    adjacency: dict[str, list[str]] = {}
    for connection in draft.connections:
        adjacency.setdefault(connection.from_, []).append(connection.to)

    visited = set(starts)
    queue = deque((start, 0) for start in starts)
    while queue:
        node, depth = queue.popleft()
        for neighbour in adjacency.get(node, []):
            if neighbour in goals and depth + 1 >= 1:
                return True
            if neighbour not in visited:
                visited.add(neighbour)
                queue.append((neighbour, depth + 1))
    return False


def _no_connection(predicate: Predicate, draft: ArchitectureDraft) -> bool:
    by_type = _by_type(draft)
    sources = _ids(by_type.get(ComponentType(predicate.get("from_type")), []))
    targets = _ids(by_type.get(ComponentType(predicate.get("to_type")), []))
    return not any(
        connection.from_ in sources and connection.to in targets
        for connection in draft.connections
    )


def _group_exists(predicate: Predicate, draft: ArchitectureDraft) -> bool:
    member_type = ComponentType(predicate.get("member_type"))
    types = {component.id: component.type for component in draft.components}
    return any(
        types.get(member) == member_type
        for group in draft.groups
        for member in group.members
    )


def evaluate(predicate: Predicate | str, draft: ArchitectureDraft) -> bool:
    """Evaluate one parsed predicate. Strings are parsed for convenience."""

    if isinstance(predicate, str):
        predicate = parse(predicate)

    function = predicate.function

    if function == "component_exists":
        return _component_exists(predicate, draft)
    if function == "connection_exists":
        return _connection_exists(predicate, draft)
    if function == "path_exists":
        return _path_exists(predicate, draft)
    if function == "no_connection":
        return _no_connection(predicate, draft)
    if function == "no_component":
        return not _by_type(draft).get(ComponentType(predicate.get("type")), [])
    if function == "group_exists":
        return _group_exists(predicate, draft)
    if function == "no_reference_issues":
        return not draft.check_references()
    if function == "flag_present":
        return any(
            flag.kind.value == predicate.get("kind")
            and flag.severity.value == predicate.get("severity")
            for flag in draft.flags
        )
    if function == "no_flag":
        return not any(
            flag.severity.value == predicate.get("severity") for flag in draft.flags
        )
    if function == "assumption_present":
        needle = predicate.get("text")
        return any(_contains(assumption.text, needle) for assumption in draft.assumptions)
    if function == "component_count":
        return len(draft.components) <= int(predicate.get("lte"))

    raise ValueError(f"unsupported predicate: {function!r}")


def deterministic_gate(prompt: EvalPrompt, draft: ArchitectureDraft) -> GateResult:
    """The frozen gate: must-include, must-not-include and blocking-flag rule."""

    failed: list[str] = []

    for item in prompt.must_include:
        if item.check == "deterministic" and not evaluate(item.predicate, draft):
            failed.append(item.id)

    for item in prompt.must_not_include:
        if item.check == "deterministic" and evaluate(item.predicate, draft):
            failed.append(item.id)

    blocking = any(flag.severity is Severity.BLOCKING for flag in draft.flags)

    if prompt.blocking_flag_expected == "required":
        rule = "required_met" if blocking else "required_missing"
    elif prompt.blocking_flag_expected == "forbidden":
        rule = "forbidden_violated" if blocking else "forbidden_met"
    else:
        rule = "optional_skipped"

    passed = not failed and rule in {"required_met", "forbidden_met", "optional_skipped"}
    return GateResult(passed=passed, failed_items=tuple(failed), blocking_flag_rule=rule)
