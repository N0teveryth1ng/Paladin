"""The five deterministic graph checks.

Every graph problem is returned as an ``Issue``. Nothing here raises for a
graph problem; the only exception is a malformed rules file, which is a
configuration error raised by ``load_rules``.

The checks never read the evaluation set, the model output, or any rubric.
The rules come from ``rules.json``.
"""

from __future__ import annotations

from typing import Iterable, Sequence

import networkx as nx

from app.model.architecture import ArchitectureDraft
from app.model.component import Component
from app.model.connection import Connection
from app.model.enums import ComponentType, ConnectionType, IssueKind, IssueSeverity
from app.model.issues import Issue

from .rules import RequiredLinkRule, RuleSet, load_rules

MAX_MESSAGE_LENGTH = 400

_DEFAULT_RULES: RuleSet | None = None


def _default_rules() -> RuleSet:
    global _DEFAULT_RULES
    if _DEFAULT_RULES is None:
        _DEFAULT_RULES = load_rules()
    return _DEFAULT_RULES


def _clip(message: str, limit: int = MAX_MESSAGE_LENGTH) -> str:
    if len(message) <= limit:
        return message
    return message[: limit - 3] + "..."


def _bounded_list(items: Sequence[str], limit: int = 8) -> str:
    if len(items) <= limit:
        return ", ".join(items)
    shown = ", ".join(items[:limit])
    return f"{shown} and {len(items) - limit} more"


def _valid_graph(draft: ArchitectureDraft) -> tuple[dict[str, Component], list[tuple[str, str, Connection]]]:
    components = {component.id: component for component in draft.components}
    edges = [
        (connection.from_, connection.to, connection)
        for connection in draft.connections
        if connection.from_ in components and connection.to in components
    ]
    return components, edges


def _check_disconnected(draft: ArchitectureDraft) -> list[Issue]:
    components, edges = _valid_graph(draft)

    graph = nx.Graph()
    graph.add_nodes_from(components)
    graph.add_edges_from((source, target) for source, target, _ in edges)

    if graph.number_of_nodes() <= 1:
        return []

    groups = list(nx.connected_components(graph))
    if len(groups) == 1:
        return []

    isolated = sorted(node for node in graph.nodes if graph.degree(node) == 0)
    if isolated:
        return [
            Issue(
                kind=IssueKind.DISCONNECTED_COMPONENT,
                severity=IssueSeverity.INVALID,
                element_id=node,
                message=_clip(f"component {node!r} has no connections"),
            )
            for node in isolated
        ]

    ordered = sorted(tuple(sorted(group)) for group in groups)
    parts: list[str] = []
    for index, members in enumerate(ordered[:3], start=1):
        parts.append(f"group {index} ({_bounded_list(members, 5)})")
    if len(ordered) > 3:
        parts.append(f"and {len(ordered) - 3} more groups")

    return [
        Issue(
            kind=IssueKind.DISCONNECTED_GRAPH,
            severity=IssueSeverity.JUDGMENT,
            element_id=None,
            message=_clip(
                f"architecture splits into {len(groups)} connected groups: "
                + "; ".join(parts)
            ),
        )
    ]


def _check_pairings(draft: ArchitectureDraft, rules: RuleSet) -> list[Issue]:
    components, edges = _valid_graph(draft)
    index = {(rule.from_, rule.to): rule for rule in rules.pairings}

    issues: list[Issue] = []
    for source, target, connection in edges:
        source_type = components[source].type
        target_type = components[target].type
        rule = index.get((source_type, target_type))
        if rule is None:
            continue

        kind = (
            IssueKind.INVALID_TYPE_PAIRING
            if rule.severity is IssueSeverity.INVALID
            else IssueKind.QUESTIONABLE_TYPE_PAIRING
        )
        issues.append(
            Issue(
                kind=kind,
                severity=rule.severity,
                element_id=connection.id,
                message=_clip(
                    f"connection {connection.id!r}: "
                    f"{source_type.value} -> {target_type.value}: {rule.reason}"
                ),
            )
        )
    return issues


def _check_sync_cycles(draft: ArchitectureDraft) -> list[Issue]:
    components, edges = _valid_graph(draft)

    graph = nx.DiGraph()
    graph.add_nodes_from(components)
    for source, target, connection in edges:
        if connection.type is ConnectionType.SYNC:
            graph.add_edge(source, target)

    issues: list[Issue] = []

    for node in sorted(graph.nodes):
        if graph.has_edge(node, node):
            issues.append(
                Issue(
                    kind=IssueKind.SYNCHRONOUS_CYCLE,
                    severity=IssueSeverity.INVALID,
                    element_id=node,
                    message=_clip(f"component {node!r} has a synchronous self-loop"),
                )
            )

    cycles = sorted(
        tuple(sorted(component_ids))
        for component_ids in nx.strongly_connected_components(graph)
        if len(component_ids) > 1
    )
    for members in cycles:
        issues.append(
            Issue(
                kind=IssueKind.SYNCHRONOUS_CYCLE,
                severity=IssueSeverity.JUDGMENT,
                element_id=members[0],
                message=_clip(
                    f"synchronous cycle across {len(members)} components: "
                    f"{_bounded_list(members)}"
                ),
            )
        )

    return issues


def _count_links(
    component_id: str,
    rule: RequiredLinkRule,
    components: dict[str, Component],
    edges: Iterable[tuple[str, str, Connection]],
) -> int:
    counterparts = set(rule.counterpart_types)
    matched: set[str] = set()

    for source, target, connection in edges:
        if (
            rule.direction in ("out", "either")
            and source == component_id
            and components[target].type in counterparts
        ):
            matched.add(connection.id)
        if (
            rule.direction in ("in", "either")
            and target == component_id
            and components[source].type in counterparts
        ):
            matched.add(connection.id)

    return len(matched)


def _type_list(types: Sequence[ComponentType]) -> str:
    return ", ".join(component_type.value for component_type in types)


def _check_required_links(draft: ArchitectureDraft, rules: RuleSet) -> list[Issue]:
    components, edges = _valid_graph(draft)

    graph = nx.Graph()
    graph.add_nodes_from(components)
    graph.add_edges_from((source, target) for source, target, _ in edges)

    issues: list[Issue] = []
    for component in draft.components:
        if graph.degree(component.id) == 0:
            # The disconnected check already explains a fully isolated component.
            continue

        for rule in rules.required_links:
            if rule.applies_to is not component.type:
                continue
            if _count_links(component.id, rule, components, edges) >= rule.min_connections:
                continue

            issues.append(
                Issue(
                    kind=IssueKind.MISSING_REQUIRED_LINK,
                    severity=rule.severity,
                    element_id=component.id,
                    message=_clip(
                        f"component {component.id!r} ({component.type.value}) has no "
                        f"{rule.direction} link to {_type_list(rule.counterpart_types)}: "
                        f"{rule.reason}"
                    ),
                )
            )

    return issues


def validate_graph(
    draft: ArchitectureDraft,
    rules: RuleSet | None = None,
) -> list[Issue]:
    """Return every graph-semantic issue in deterministic order.

    The order is: referential issues from ``check_references()``, disconnected
    components, type pairings, synchronous cycles, missing required links.
    The function never raises for a graph problem.
    """

    if rules is None:
        rules = _default_rules()

    issues: list[Issue] = list(draft.check_references())
    issues.extend(_check_disconnected(draft))
    issues.extend(_check_pairings(draft, rules))
    issues.extend(_check_sync_cycles(draft))
    issues.extend(_check_required_links(draft, rules))
    return issues
