"""Validator tests: fixtures, broken variants, cycles, severity, performance."""

from __future__ import annotations

import hashlib
import json
import statistics
import time
from pathlib import Path
from typing import Any

import pytest

from app.model import (
    ArchitectureDraft,
    Component,
    Connection,
    Issue,
    IssueKind,
    IssueSeverity,
)
from app.model.enums import ConnectionType
from app.validation import load_rules, validate_graph

BACKEND = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures"


def load_raw(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def small() -> ArchitectureDraft:
    return ArchitectureDraft.model_validate(load_raw("small_architecture.json"))


def full() -> ArchitectureDraft:
    return ArchitectureDraft.model_validate(load_raw("full_coverage_architecture.json"))


def make_draft(
    components: list[tuple[str, str]],
    connections: list[tuple[str, str, str, str]],
) -> ArchitectureDraft:
    requirement = {
        "id": "req_x",
        "text": "A requirement for the test architecture.",
        "kind": "functional",
        "source": "prompt",
    }
    raw = {
        "title": "Test architecture",
        "summary": "A synthetic architecture used by the validator tests.",
        "requirements": [requirement],
        "components": [
            {
                "id": component_id,
                "type": component_type,
                "name": component_id,
                "description": f"{component_id} component.",
                "attributes": {},
                "requirement_refs": ["req_x"],
                "assumed": False,
                "rationale": None,
            }
            for component_id, component_type in components
        ],
        "connections": [
            {
                "id": connection_id,
                "from": source,
                "to": target,
                "type": connection_type,
                "label": f"{source} to {target}",
                "requirement_refs": ["req_x"],
                "assumed": False,
                "rationale": None,
            }
            for connection_id, source, target, connection_type in connections
        ],
        "groups": [],
        "assumptions": [],
        "flags": [],
    }
    return ArchitectureDraft.model_validate(raw)


def add_component(
    draft: ArchitectureDraft,
    component_id: str,
    component_type: str,
    requirement: str = "req_create",
) -> None:
    draft.components.append(
        Component.model_validate(
            {
                "id": component_id,
                "type": component_type,
                "name": component_id,
                "description": f"{component_id} component.",
                "attributes": {},
                "requirement_refs": [requirement],
                "assumed": False,
                "rationale": None,
            }
        )
    )


def add_connection(
    draft: ArchitectureDraft,
    connection_id: str,
    source: str,
    target: str,
    connection_type: str,
    requirement: str = "req_create",
    label: str = "test connection",
) -> None:
    draft.connections.append(
        Connection.model_validate(
            {
                "id": connection_id,
                "from": source,
                "to": target,
                "type": connection_type,
                "label": label,
                "requirement_refs": [requirement],
                "assumed": False,
                "rationale": None,
            }
        )
    )


def percentile_95(timings: list[float]) -> float:
    ordered = sorted(timings)
    return ordered[int(0.95 * (len(ordered) - 1))]


# 1 ---------------------------------------------------------------------
@pytest.mark.parametrize(
    "name", ["small_architecture.json", "full_coverage_architecture.json"]
)
def test_clean_fixtures_return_no_issues(name: str) -> None:
    assert validate_graph(ArchitectureDraft.model_validate(load_raw(name))) == []


# 2 ---------------------------------------------------------------------
def test_disconnected_isolated_component_is_invalid() -> None:
    draft = small()
    add_component(draft, "cmp_orphan", "service")

    issues = validate_graph(draft)

    assert len(issues) == 1
    assert issues[0].kind is IssueKind.DISCONNECTED_COMPONENT
    assert issues[0].severity is IssueSeverity.INVALID
    assert issues[0].element_id == "cmp_orphan"
    assert not any(issue.kind is IssueKind.MISSING_REQUIRED_LINK for issue in issues)


# 3 ---------------------------------------------------------------------
def test_disconnected_split_graph_is_judgment() -> None:
    draft = small()
    add_component(draft, "cmp_extra_client", "client")
    add_component(draft, "cmp_extra_service", "service")
    add_connection(
        draft,
        "cnx_extra_client_service",
        "cmp_extra_client",
        "cmp_extra_service",
        "sync",
    )

    issues = validate_graph(draft)

    assert len(issues) == 1
    assert issues[0].kind is IssueKind.DISCONNECTED_GRAPH
    assert issues[0].severity is IssueSeverity.JUDGMENT
    assert issues[0].element_id is None
    assert not any(issue.kind is IssueKind.DISCONNECTED_COMPONENT for issue in issues)


# 4 ---------------------------------------------------------------------
def test_single_component_with_no_connections_is_legal() -> None:
    draft = make_draft([("cmp_solo", "service")], [])

    assert validate_graph(draft) == []


# 5 ---------------------------------------------------------------------
def test_dangling_source_reuses_the_existing_kind() -> None:
    draft = small()
    draft.connections[0].from_ = "cmp_ghost"

    issues = validate_graph(draft)
    dangling = [
        issue for issue in issues if issue.kind is IssueKind.DANGLING_CONNECTION_SOURCE
    ]

    assert len(dangling) == 1
    assert dangling[0].severity is IssueSeverity.INVALID
    assert dangling[0].element_id == "cnx_client_gateway"


def test_dangling_target_reuses_the_existing_kind() -> None:
    draft = small()
    draft.connections[0].to = "cmp_ghost"

    issues = validate_graph(draft)
    dangling = [
        issue for issue in issues if issue.kind is IssueKind.DANGLING_CONNECTION_TARGET
    ]

    assert len(dangling) == 1
    assert dangling[0].severity is IssueSeverity.INVALID
    assert dangling[0].element_id == "cnx_client_gateway"


# 6 ---------------------------------------------------------------------
def test_invalid_pairing_is_reported() -> None:
    draft = small()
    add_component(draft, "cmp_legacy_client", "client")
    add_connection(
        draft,
        "cnx_db_legacy_client",
        "cmp_db",
        "cmp_legacy_client",
        "sync",
    )

    issues = validate_graph(draft)

    assert len(issues) == 1
    issue = issues[0]
    assert issue.kind is IssueKind.INVALID_TYPE_PAIRING
    assert issue.severity is IssueSeverity.INVALID
    assert issue.element_id == "cnx_db_legacy_client"
    assert "database" in issue.message
    assert "client" in issue.message


# 6b --------------------------------------------------------------------
def test_client_to_database_is_judgment() -> None:
    draft = small()
    add_connection(draft, "cnx_client_db", "cmp_web", "cmp_db", "sync")

    issues = validate_graph(draft)

    assert len(issues) == 1
    issue = issues[0]
    assert issue.kind is IssueKind.QUESTIONABLE_TYPE_PAIRING
    assert issue.severity is IssueSeverity.JUDGMENT
    assert issue.element_id == "cnx_client_db"
    assert "client" in issue.message
    assert "database" in issue.message


# 7 ---------------------------------------------------------------------
def test_questionable_pairing_is_reported() -> None:
    draft = small()
    add_connection(draft, "cnx_client_cache", "cmp_web", "cmp_cache", "sync")

    issues = validate_graph(draft)

    assert len(issues) == 1
    issue = issues[0]
    assert issue.kind is IssueKind.QUESTIONABLE_TYPE_PAIRING
    assert issue.severity is IssueSeverity.JUDGMENT
    assert issue.element_id == "cnx_client_cache"


# 8 ---------------------------------------------------------------------
def test_synchronous_cycle_of_two_components_is_judgment() -> None:
    draft = make_draft(
        [("cmp_s1", "service"), ("cmp_s2", "service")],
        [
            ("cnx_s1_s2", "cmp_s1", "cmp_s2", "sync"),
            ("cnx_s2_s1", "cmp_s2", "cmp_s1", "sync"),
        ],
    )

    issues = validate_graph(draft)

    assert len(issues) == 1
    issue = issues[0]
    assert issue.kind is IssueKind.SYNCHRONOUS_CYCLE
    assert issue.severity is IssueSeverity.JUDGMENT
    assert issue.element_id == "cmp_s1"
    assert "cmp_s1" in issue.message
    assert "cmp_s2" in issue.message


# 9 ---------------------------------------------------------------------
def test_async_cycle_is_allowed() -> None:
    draft = make_draft(
        [("cmp_s1", "service"), ("cmp_s2", "service")],
        [
            ("cnx_s1_s2", "cmp_s1", "cmp_s2", "async"),
            ("cnx_s2_s1", "cmp_s2", "cmp_s1", "async"),
        ],
    )

    assert validate_graph(draft) == []


# 10 --------------------------------------------------------------------
def test_mixed_cycle_is_allowed_until_closed_with_sync() -> None:
    draft = make_draft(
        [
            ("cmp_s1", "service"),
            ("cmp_s2", "service"),
            ("cmp_s3", "service"),
        ],
        [
            ("cnx_s1_s2", "cmp_s1", "cmp_s2", "sync"),
            ("cnx_s2_s3", "cmp_s2", "cmp_s3", "sync"),
            ("cnx_s3_s1", "cmp_s3", "cmp_s1", "async"),
        ],
    )

    assert validate_graph(draft) == []

    draft.connections[2].type = ConnectionType.SYNC
    issues = validate_graph(draft)

    assert len(issues) == 1
    assert issues[0].kind is IssueKind.SYNCHRONOUS_CYCLE
    assert issues[0].severity is IssueSeverity.JUDGMENT


# 11 --------------------------------------------------------------------
def test_synchronous_self_loop_is_invalid() -> None:
    draft = make_draft(
        [("cmp_solo", "service")],
        [("cnx_solo_solo", "cmp_solo", "cmp_solo", "sync")],
    )

    issues = validate_graph(draft)

    assert len(issues) == 1
    assert issues[0].kind is IssueKind.SYNCHRONOUS_CYCLE
    assert issues[0].severity is IssueSeverity.INVALID
    assert issues[0].element_id == "cmp_solo"


# 12 --------------------------------------------------------------------
def test_async_self_loop_is_allowed() -> None:
    draft = make_draft(
        [("cmp_solo", "service")],
        [("cnx_solo_solo", "cmp_solo", "cmp_solo", "async")],
    )

    assert validate_graph(draft) == []


# 13 --------------------------------------------------------------------
def test_missing_required_link_invalid() -> None:
    draft = full()
    draft.connections = [
        connection
        for connection in draft.connections
        if connection.id != "cnx_lb_api"
    ]

    issues = validate_graph(draft)

    assert len(issues) == 1
    issue = issues[0]
    assert issue.kind is IssueKind.MISSING_REQUIRED_LINK
    assert issue.severity is IssueSeverity.INVALID
    assert issue.element_id == "cmp_load_balancer"
    assert not any(
        issue.kind is IssueKind.DISCONNECTED_COMPONENT for issue in issues
    )


# 14 --------------------------------------------------------------------
def test_missing_required_link_judgment() -> None:
    draft = full()
    draft.connections = [
        connection
        for connection in draft.connections
        if connection.id != "cnx_api_search"
    ]
    add_connection(
        draft,
        "cnx_search_api",
        "cmp_search",
        "cmp_api",
        "sync",
        requirement="req_search",
        label="search queries",
    )

    issues = validate_graph(draft)

    missing = [
        issue for issue in issues if issue.kind is IssueKind.MISSING_REQUIRED_LINK
    ]
    questionable = [
        issue for issue in issues if issue.kind is IssueKind.QUESTIONABLE_TYPE_PAIRING
    ]

    assert len(missing) == 1
    assert missing[0].element_id == "cmp_search"
    assert missing[0].severity is IssueSeverity.JUDGMENT

    assert len(questionable) == 1
    assert questionable[0].element_id == "cnx_search_api"
    assert questionable[0].severity is IssueSeverity.JUDGMENT


# 15 --------------------------------------------------------------------
def test_missing_link_is_suppressed_on_an_isolated_component() -> None:
    draft = full()
    draft.connections = [
        connection
        for connection in draft.connections
        if connection.from_ != "cmp_db" and connection.to != "cmp_db"
    ]

    issues = validate_graph(draft)

    assert len(issues) == 1
    assert issues[0].kind is IssueKind.DISCONNECTED_COMPONENT
    assert issues[0].element_id == "cmp_db"
    assert not any(
        issue.kind is IssueKind.MISSING_REQUIRED_LINK
        and issue.element_id == "cmp_db"
        for issue in issues
    )


# 16 --------------------------------------------------------------------
def test_severity_defaults_to_invalid() -> None:
    issue = Issue(kind=IssueKind.DANGLING_CONNECTION_SOURCE, message="x")
    assert issue.severity is IssueSeverity.INVALID

    draft = small()
    draft.connections[0].from_ = "cmp_ghost"
    assert all(
        reference.severity is IssueSeverity.INVALID
        for reference in draft.check_references()
    )


# 17 --------------------------------------------------------------------
def test_output_is_deterministic() -> None:
    draft = small()
    add_connection(draft, "cnx_client_db", "cmp_web", "cmp_db", "sync")

    assert validate_graph(draft) == validate_graph(draft)
    assert load_rules() == load_rules()


# 18 --------------------------------------------------------------------
def test_messages_stay_within_the_bound() -> None:
    ring = make_draft(
        [(f"cmp_s{index:03d}", "service") for index in range(120)],
        [
            (
                f"cnx_r{index:03d}",
                f"cmp_s{index:03d}",
                f"cmp_s{(index + 1) % 120:03d}",
                "sync",
            )
            for index in range(120)
        ],
    )
    ring_issues = validate_graph(ring)

    assert len(ring_issues) == 1
    assert all(len(issue.message) <= 400 for issue in ring_issues)
    assert "more" in ring_issues[0].message

    isolated = make_draft(
        [(f"cmp_s{index:03d}", "service") for index in range(120)], []
    )
    isolated_issues = validate_graph(isolated)

    assert len(isolated_issues) == 120
    assert all(len(issue.message) <= 400 for issue in isolated_issues)


# 19 --------------------------------------------------------------------
def test_validators_are_not_wired_into_any_pipeline() -> None:
    for relative in (
        "app/eval/evaluate.py",
        "app/eval/runner.py",
        "app/llm/generate.py",
        "app/llm/scratch_runner.py",
    ):
        text = (BACKEND / relative).read_text(encoding="utf-8")
        assert "app.validation" not in text, relative
        assert "validate_graph" not in text, relative

    for path in (BACKEND / "app" / "validation").glob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "app.eval" not in text, str(path)
        assert "app.llm" not in text, str(path)


# 20 --------------------------------------------------------------------
def test_evaluator_still_has_no_networkx_import() -> None:
    text = (BACKEND / "app" / "eval" / "evaluate.py").read_text(encoding="utf-8")
    assert "networkx" not in text


# 21 --------------------------------------------------------------------
def test_schema_artifacts_are_byte_identical() -> None:
    expected = {
        "architecture.generation.schema.json": (
            "0033E0C195B72B0E822CD4DCA8A4C3EB418AEB22765A66F04E90448A760FC89F"
        ),
        "architecture.stored.schema.json": (
            "1E9C1EE76533E1437EE7B402BE18090A82CDB4448B15E0D7CD036579981DA995"
        ),
    }

    for name, digest in expected.items():
        path = REPO / "schema" / name
        assert path.exists(), name
        actual = hashlib.sha256(path.read_bytes()).hexdigest().upper()
        assert actual == digest, f"{name} changed: {actual}"


# 22 --------------------------------------------------------------------
def test_performance_on_a_clean_120_component_graph() -> None:
    components = [("cmp_client", "client")] + [
        (f"cmp_s{index:03d}", "service") for index in range(119)
    ]

    connections: list[tuple[str, str, str, str]] = []
    previous = "cmp_client"
    for index in range(119):
        target = f"cmp_s{index:03d}"
        connections.append((f"cnx_chain_{index:03d}", previous, target, "sync"))
        previous = target

    existing = {(source, target) for _, source, target, _ in connections}
    extra_index = 0
    for source_index in range(119):
        for target_index in range(source_index + 2, 119):
            if len(connections) >= 300:
                break
            source = f"cmp_s{source_index:03d}"
            target = f"cmp_s{target_index:03d}"
            if (source, target) in existing:
                continue
            connections.append(
                (f"cnx_extra_{extra_index:03d}", source, target, "sync")
            )
            existing.add((source, target))
            extra_index += 1
        if len(connections) >= 300:
            break

    assert len(connections) == 300
    draft = make_draft(components, connections)
    assert validate_graph(draft) == []

    timings: list[float] = []
    for _ in range(100):
        start = time.perf_counter()
        validate_graph(draft)
        timings.append(time.perf_counter() - start)

    median = statistics.median(timings)
    p95 = percentile_95(timings)
    print(f"clean 120/300 median={median * 1000:.2f}ms p95={p95 * 1000:.2f}ms")

    assert p95 < 0.5


# 23 --------------------------------------------------------------------
def test_performance_on_a_sync_ring() -> None:
    draft = make_draft(
        [(f"cmp_s{index:03d}", "service") for index in range(120)],
        [
            (
                f"cnx_r{index:03d}",
                f"cmp_s{index:03d}",
                f"cmp_s{(index + 1) % 120:03d}",
                "sync",
            )
            for index in range(120)
        ],
    )

    issues = validate_graph(draft)
    assert len(issues) == 1
    assert issues[0].kind is IssueKind.SYNCHRONOUS_CYCLE

    timings: list[float] = []
    for _ in range(50):
        start = time.perf_counter()
        validate_graph(draft)
        timings.append(time.perf_counter() - start)

    median = statistics.median(timings)
    p95 = percentile_95(timings)
    print(f"sync ring 120 median={median * 1000:.2f}ms p95={p95 * 1000:.2f}ms")

    assert p95 < 0.5


# 24 --------------------------------------------------------------------
def test_performance_on_isolated_components() -> None:
    draft = make_draft(
        [(f"cmp_s{index:03d}", "service") for index in range(120)], []
    )

    issues = validate_graph(draft)
    assert len(issues) == 120
    assert all(
        issue.kind is IssueKind.DISCONNECTED_COMPONENT for issue in issues
    )

    timings: list[float] = []
    for _ in range(50):
        start = time.perf_counter()
        validate_graph(draft)
        timings.append(time.perf_counter() - start)

    median = statistics.median(timings)
    p95 = percentile_95(timings)
    print(f"isolated 120 median={median * 1000:.2f}ms p95={p95 * 1000:.2f}ms")

    assert p95 < 0.5
