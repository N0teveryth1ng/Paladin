"""Model-level tests: shape errors fail hard, meaning errors are reported."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.model import (
    Architecture,
    ArchitectureDraft,
    ComponentType,
    ConnectionType,
    IssueKind,
    RequirementKind,
    Severity,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def small() -> dict[str, Any]:
    return copy.deepcopy(load("small_architecture.json"))


def full() -> dict[str, Any]:
    return copy.deepcopy(load("full_coverage_architecture.json"))


def component(raw: dict[str, Any], component_id: str) -> dict[str, Any]:
    return next(c for c in raw["components"] if c["id"] == component_id)


def connection(raw: dict[str, Any], connection_id: str) -> dict[str, Any]:
    return next(c for c in raw["connections"] if c["id"] == connection_id)


# 1 ---------------------------------------------------------------------
def test_small_fixture_parses_and_round_trips_exactly() -> None:
    raw = load("small_architecture.json")
    draft = ArchitectureDraft.model_validate(raw)

    assert draft.title == "URL Shortener"
    assert len(draft.components) == 5
    assert len(draft.connections) == 4

    dumped = draft.model_dump(mode="json", by_alias=True)
    assert dumped == raw, "dump must reproduce the source document byte-for-value"
    assert ArchitectureDraft.model_validate(dumped) == draft


# 2 ---------------------------------------------------------------------
def test_full_coverage_fixture_uses_all_fourteen_component_types() -> None:
    draft = ArchitectureDraft.model_validate(load("full_coverage_architecture.json"))

    used = {c.type for c in draft.components}
    assert used == set(ComponentType), f"missing types: {set(ComponentType) - used}"
    assert len(ComponentType) == 14
    assert len({c.id for c in draft.components}) == len(draft.components)

    connection_types = {c.type for c in draft.connections}
    assert connection_types == set(ConnectionType)


# 3 ---------------------------------------------------------------------
def test_unknown_component_type_is_rejected() -> None:
    raw = small()
    raw["components"][0]["type"] = "blockchain"

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "blockchain" in str(excinfo.value)


# 4 ---------------------------------------------------------------------
def test_unknown_field_is_rejected() -> None:
    raw = small()
    raw["components"][0]["color"] = "#ff0000"

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "color" in str(excinfo.value)
    assert "extra" in str(excinfo.value).lower() or "Extra inputs" in str(excinfo.value)


# 5 ---------------------------------------------------------------------
def test_missing_assumed_flag_is_rejected() -> None:
    raw = small()
    del raw["components"][0]["assumed"]

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "assumed" in str(excinfo.value)


# 6 ---------------------------------------------------------------------
def test_fact_without_requirement_refs_is_rejected() -> None:
    raw = small()
    target = component(raw, "cmp_db")
    target["assumed"] = False
    target["requirement_refs"] = []

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "at least one requirement_ref" in str(excinfo.value)


# 7 ---------------------------------------------------------------------
@pytest.mark.parametrize("rationale", [None, "", "   "])
def test_assumption_without_rationale_is_rejected(rationale: str | None) -> None:
    raw = small()
    target = component(raw, "cmp_db")
    target["assumed"] = True
    target["rationale"] = rationale

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "non-empty rationale" in str(excinfo.value)


# 8 ---------------------------------------------------------------------
def test_duplicate_component_ids_are_rejected() -> None:
    raw = small()
    raw["components"].append(copy.deepcopy(raw["components"][0]))

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "duplicate ids in components" in str(excinfo.value)


def test_duplicate_connection_ids_are_rejected() -> None:
    raw = small()
    raw["connections"].append(copy.deepcopy(raw["connections"][0]))

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "duplicate ids in connections" in str(excinfo.value)


# 9 ---------------------------------------------------------------------
@pytest.mark.parametrize("value", ["0", "3", "9999"])
def test_replicas_accepts_non_negative_integer_strings(value: str) -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["replicas"] = value
    draft = ArchitectureDraft.model_validate(raw)
    assert component(raw, "cmp_db")["attributes"]["replicas"] == value
    assert draft is not None


@pytest.mark.parametrize("value", ["many", "-1", "3.5", "", "1e3"])
def test_replicas_rejects_non_integer_strings(value: str) -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["replicas"] = value

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "replicas" in str(excinfo.value)


def test_replicas_rejects_integer_json_value() -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["replicas"] = 3

    with pytest.raises(ValidationError):
        ArchitectureDraft.model_validate(raw)


# 10 --------------------------------------------------------------------
@pytest.mark.parametrize("value", ["http", "https", "grpc", "websocket", "tcp", "sql", "amqp", "other"])
def test_protocol_accepts_listed_values(value: str) -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["protocol"] = value
    ArchitectureDraft.model_validate(raw)


def test_protocol_rejects_unlisted_value() -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["protocol"] = "carrier-pigeon"

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "protocol" in str(excinfo.value)


@pytest.mark.parametrize("value", ["strong", "eventual", "causal", "not_applicable"])
def test_consistency_accepts_listed_values(value: str) -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["consistency"] = value
    ArchitectureDraft.model_validate(raw)


def test_consistency_rejects_unlisted_value() -> None:
    raw = small()
    component(raw, "cmp_db")["attributes"]["consistency"] = "kinda-strong"

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "consistency" in str(excinfo.value)


# 11 --------------------------------------------------------------------
def test_check_references_reports_soft_problems_without_raising() -> None:
    raw = small()

    connection(raw, "cnx_client_gateway")["from"] = "cmp_ghost_source"
    connection(raw, "cnx_service_cache")["to"] = "cmp_ghost_target"
    raw["groups"][0]["members"].append("cmp_ghost_member")
    component(raw, "cmp_shortener")["requirement_refs"].append("req_ghost")

    raw["groups"].append(
        {
            "id": "grp_second",
            "name": "Second Group",
            "description": "A second group that overlaps the first.",
            "members": ["cmp_gateway"],
            "parent_id": None,
            "requirement_refs": ["req_create"],
            "assumed": False,
            "rationale": None,
        }
    )

    draft = ArchitectureDraft.model_validate(raw)
    kinds = {issue.kind for issue in draft.check_references()}

    assert IssueKind.DANGLING_CONNECTION_SOURCE in kinds
    assert IssueKind.DANGLING_CONNECTION_TARGET in kinds
    assert IssueKind.UNKNOWN_GROUP_MEMBER in kinds
    assert IssueKind.UNKNOWN_REQUIREMENT_REF in kinds
    assert IssueKind.COMPONENT_IN_MULTIPLE_GROUPS in kinds


def test_check_references_reports_nesting_beyond_one_level() -> None:
    raw = full()
    assert ArchitectureDraft.model_validate(raw).check_references() == []

    raw["groups"].append(
        {
            "id": "grp_deep",
            "name": "Too Deep",
            "description": "Nested under a group that already has a parent.",
            "members": ["cmp_billing"],
            "parent_id": "grp_data",
            "requirement_refs": ["req_upload"],
            "assumed": False,
            "rationale": None,
        }
    )

    draft = ArchitectureDraft.model_validate(raw)
    issues = draft.check_references()
    assert IssueKind.GROUP_NESTING_TOO_DEEP in {issue.kind for issue in issues}


def test_clean_fixtures_have_no_reference_issues() -> None:
    assert ArchitectureDraft.model_validate(load("small_architecture.json")).check_references() == []
    assert ArchitectureDraft.model_validate(load("full_coverage_architecture.json")).check_references() == []


def test_check_references_reports_unknown_group_parent() -> None:
    """A parent_id that names no group must be reported, not raised."""
    raw = small()
    raw["groups"][0]["parent_id"] = "grp_missing_parent"

    draft = ArchitectureDraft.model_validate(raw)
    issues = draft.check_references()

    assert [issue.kind for issue in issues] == [IssueKind.UNKNOWN_GROUP_PARENT]
    assert issues[0].element_id == "grp_backend"
    assert "grp_missing_parent" in issues[0].message


def test_check_references_reports_self_parent_group() -> None:
    raw = small()
    raw["groups"][0]["parent_id"] = "grp_backend"

    draft = ArchitectureDraft.model_validate(raw)
    issues = draft.check_references()

    assert [issue.kind for issue in issues] == [IssueKind.SELF_PARENT_GROUP]
    assert issues[0].element_id == "grp_backend"


# 12 --------------------------------------------------------------------
def test_blocking_flag_parses_and_is_delivered() -> None:
    draft = ArchitectureDraft.model_validate(load("small_architecture.json"))

    blocking = [f for f in draft.flags if f.severity is Severity.BLOCKING]
    assert len(blocking) == 1
    assert blocking[0].resolved_by is None
    assert blocking[0].kind.value == "contradiction"
    assert len(draft.components) == 5, "a blocking flag must not suppress the architecture"


def test_blocking_flag_cannot_be_resolved_by_an_assumption() -> None:
    raw = small()
    raw["flags"][0]["resolved_by"] = "asm_no_expiry"

    with pytest.raises(ValidationError) as excinfo:
        ArchitectureDraft.model_validate(raw)
    assert "blocking flag cannot be resolved" in str(excinfo.value)


def test_warning_flag_may_be_resolved_by_an_assumption() -> None:
    draft = ArchitectureDraft.model_validate(load("full_coverage_architecture.json"))
    warning = draft.flags[0]
    assert warning.severity is Severity.WARNING
    assert warning.resolved_by == "asm_retention"


# extra guards ----------------------------------------------------------
def test_requirement_kinds_and_sources_are_covered_by_fixtures() -> None:
    kinds = {
        r["kind"]
        for raw in (load("small_architecture.json"), load("full_coverage_architecture.json"))
        for r in raw["requirements"]
    }
    assert RequirementKind.FUNCTIONAL in kinds
    assert RequirementKind.NON_FUNCTIONAL in kinds
    assert RequirementKind.CONSTRAINT in kinds


def test_stored_record_requires_the_injected_envelope() -> None:
    raw = load("small_architecture.json")

    with pytest.raises(ValidationError) as excinfo:
        Architecture.model_validate(raw)
    message = str(excinfo.value)
    for field in ("schema_version", "prompt", "domain", "meta"):
        assert field in message


def test_connection_wire_names_are_from_and_to() -> None:
    draft = ArchitectureDraft.model_validate(load("small_architecture.json"))
    dumped = draft.model_dump(mode="json", by_alias=True)
    assert all({"from", "to"} <= set(c) for c in dumped["connections"])
    assert all("from_" not in c for c in dumped["connections"])


ENVELOPE = {
    "schema_version": "1.0",
    "prompt": "A representative prompt used to prove the stored record round-trips.",
    "domain": "web_backend",
    "meta": {
        "provider": "zhipu",
        "model": "glm-4-flash",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "generated_at": "2026-11-12T09:00:00Z",
    },
}


@pytest.mark.parametrize(
    "name", ["small_architecture.json", "full_coverage_architecture.json"]
)
def test_both_fixtures_round_trip_as_draft_and_stored(name: str) -> None:
    raw = load(name)

    draft = ArchitectureDraft.model_validate(raw)
    assert draft.model_dump(mode="json", by_alias=True) == raw
    assert ArchitectureDraft.model_validate(draft.model_dump(mode="json", by_alias=True)) == draft

    stored_raw = {**raw, **ENVELOPE}
    stored = Architecture.model_validate(stored_raw)
    assert stored.model_dump(mode="json", by_alias=True) == stored_raw
    assert Architecture.model_validate(stored.model_dump(mode="json", by_alias=True)) == stored


def test_model_package_resolves_inside_backend() -> None:
    """Guard against an unrelated `app` package on PYTHONPATH shadowing this one."""
    import app.model

    resolved = Path(app.model.__file__).resolve()
    assert resolved.parents[2] == Path(__file__).resolve().parents[1], (
        f"app.model resolved to {resolved}, which is outside backend/"
    )
