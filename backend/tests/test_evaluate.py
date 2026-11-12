"""Every predicate, path semantics, cycles and the deterministic gate."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.eval.evaluate import deterministic_gate, evaluate
from app.eval.models import EvalPrompt, RubricItem
from app.model.architecture import ArchitectureDraft

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "backend" / "tests" / "fixtures"


def small() -> ArchitectureDraft:
    return ArchitectureDraft.model_validate(
        json.loads((FIXTURES / "small_architecture.json").read_text(encoding="utf-8"))
    )


def make_draft(
    components: list[tuple[str, str]],
    connections: list[tuple[str, str, str, str, str]] = (),
    groups: list[tuple[str, list[str]]] = (),
    flags: list[dict[str, Any]] = (),
    assumptions: list[dict[str, Any]] = (),
) -> ArchitectureDraft:
    return ArchitectureDraft.model_validate(
        {
            "title": "Test",
            "summary": "Test design.",
            "requirements": [
                {
                    "id": "req_base",
                    "text": "A base requirement.",
                    "kind": "functional",
                    "source": "prompt",
                }
            ],
            "components": [
                {
                    "id": component_id,
                    "type": component_type,
                    "name": component_id,
                    "technology": None,
                    "description": "A component.",
                    "attributes": {},
                    "requirement_refs": ["req_base"],
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
                    "label": label,
                    "technology": None,
                    "requirement_refs": ["req_base"],
                    "assumed": False,
                    "rationale": None,
                }
                for connection_id, source, target, connection_type, label in connections
            ],
            "groups": [
                {
                    "id": group_id,
                    "name": group_id,
                    "description": "A group.",
                    "members": members,
                    "parent_id": None,
                    "requirement_refs": ["req_base"],
                    "assumed": False,
                    "rationale": None,
                }
                for group_id, members in groups
            ],
            "assumptions": list(assumptions),
            "flags": list(flags),
        }
    )


def prompt(
    *,
    must_include: list[RubricItem] | None = None,
    must_not_include: list[RubricItem] | None = None,
    blocking: str = "forbidden",
) -> EvalPrompt:
    return EvalPrompt(
        id="ev_99",
        title="Test prompt",
        category="simple",
        prompt="A test prompt.",
        expected_requirements=[],
        must_include=must_include or [],
        must_not_include=must_not_include or [],
        blocking_flag_expected=blocking,
    )


def item(item_id: str, predicate: str, check: str = "deterministic") -> RubricItem:
    return RubricItem(
        id=item_id,
        statement="A rubric item.",
        check=check,
        predicate=predicate,
    )


# -- component predicates ---------------------------------------------------


def test_component_exists() -> None:
    draft = small()
    assert evaluate("component_exists(type=service)", draft)
    assert evaluate("component_exists(type=worker)", draft) is False


def test_component_exists_technology_is_case_insensitive() -> None:
    draft = small()
    assert evaluate("component_exists(type=database, technology~=\"POSTGRES\")", draft)
    assert evaluate("component_exists(type=database, technology~=\"mysql\")", draft) is False


def test_no_component() -> None:
    draft = small()
    assert evaluate("no_component(type=worker)", draft)
    assert evaluate("no_component(type=service)", draft) is False


def test_component_count_is_inclusive() -> None:
    draft = small()
    assert evaluate("component_count(lte=5)", draft)
    assert evaluate("component_count(lte=4)", draft) is False


# -- connections and paths --------------------------------------------------


def test_connection_exists_by_type_and_label() -> None:
    draft = small()
    assert evaluate(
        "connection_exists(from_type=service, to_type=database, type=sync)", draft
    )
    assert evaluate(
        'connection_exists(from_type=client, to_type=api_gateway, label~="https")', draft
    )
    assert evaluate(
        "connection_exists(from_type=service, to_type=database, type=async)", draft
    ) is False


def test_path_exists_through_an_intermediate() -> None:
    draft = small()
    assert evaluate("path_exists(from_type=client, to_type=database)", draft)


def test_path_exists_is_directional() -> None:
    draft = small()
    assert evaluate("path_exists(from_type=database, to_type=client)", draft) is False


def test_path_exists_through_async_only_chain() -> None:
    draft = make_draft(
        components=[
            ("cmp_service", "service"),
            ("cmp_queue", "message_queue"),
            ("cmp_worker", "worker"),
        ],
        connections=[
            ("cnx_one", "cmp_service", "cmp_queue", "async", "publishes"),
            ("cnx_two", "cmp_queue", "cmp_worker", "async", "delivers"),
        ],
    )
    assert evaluate("path_exists(from_type=service, to_type=worker)", draft)
    assert evaluate(
        "connection_exists(from_type=service, to_type=worker, type=sync)", draft
    ) is False


def test_path_exists_terminates_on_a_cycle() -> None:
    draft = make_draft(
        components=[
            ("cmp_client", "client"),
            ("cmp_a", "service"),
            ("cmp_b", "service"),
        ],
        connections=[
            ("cnx_ca", "cmp_client", "cmp_a", "sync", "calls"),
            ("cnx_ab", "cmp_a", "cmp_b", "sync", "calls"),
            ("cnx_ba", "cmp_b", "cmp_a", "sync", "calls"),
        ],
    )
    assert evaluate("path_exists(from_type=client, to_type=service)", draft)
    assert evaluate("path_exists(from_type=client, to_type=client)", draft) is False


def test_no_connection_ignores_chains() -> None:
    chained = make_draft(
        components=[
            ("cmp_client", "client"),
            ("cmp_gateway", "api_gateway"),
            ("cmp_db", "database"),
        ],
        connections=[
            ("cnx_one", "cmp_client", "cmp_gateway", "sync", "calls"),
            ("cnx_two", "cmp_gateway", "cmp_db", "sync", "writes"),
        ],
    )
    assert evaluate("no_connection(from_type=client, to_type=database)", chained)

    direct = make_draft(
        components=[("cmp_client", "client"), ("cmp_db", "database")],
        connections=[("cnx_one", "cmp_client", "cmp_db", "sync", "writes")],
    )
    assert evaluate("no_connection(from_type=client, to_type=database)", direct) is False


# -- references, flags, groups, assumptions ---------------------------------


def test_no_reference_issues_is_false_on_a_dangling_connection() -> None:
    payload = json.loads(
        (FIXTURES / "small_architecture.json").read_text(encoding="utf-8")
    )
    payload["connections"].append(
        {
            "id": "cnx_dangling",
            "from": "cmp_missing",
            "to": "cmp_db",
            "type": "sync",
            "label": "broken",
            "technology": None,
            "requirement_refs": ["req_create"],
            "assumed": False,
            "rationale": None,
        }
    )
    draft = ArchitectureDraft.model_validate(payload)
    assert evaluate("no_reference_issues()", draft) is False


def test_flag_present_matches_kind_and_severity() -> None:
    draft = small()
    assert evaluate("flag_present(kind=contradiction, severity=blocking)", draft)
    assert evaluate("flag_present(kind=contradiction, severity=warning)", draft) is False
    assert evaluate("flag_present(kind=underspecified, severity=blocking)", draft) is False


def test_no_flag_matches_severity_only() -> None:
    draft = small()
    assert evaluate("no_flag(severity=blocking)", draft) is False
    assert evaluate("no_flag(severity=warning)", draft)


def test_group_exists_uses_direct_members() -> None:
    draft = small()
    assert evaluate("group_exists(member_type=database)", draft)
    assert evaluate("group_exists(member_type=worker)", draft) is False


def test_assumption_present_is_case_insensitive() -> None:
    draft = small()
    assert evaluate('assumption_present(text~="EXPIRE")', draft)
    assert evaluate('assumption_present(text~="deletion workflow")', draft)


# -- gate -------------------------------------------------------------------


def test_gate_forbidden_blocks_a_blocking_flag() -> None:
    draft = small()
    result = deterministic_gate(
        prompt(must_include=[item("r01", "component_exists(type=service)")]), draft
    )
    assert result.passed is False
    assert result.blocking_flag_rule == "forbidden_violated"


def test_gate_passes_when_forbidden_and_clean() -> None:
    payload = json.loads(
        (FIXTURES / "small_architecture.json").read_text(encoding="utf-8")
    )
    payload["flags"] = []
    draft = ArchitectureDraft.model_validate(payload)
    result = deterministic_gate(
        prompt(must_include=[item("r01", "component_exists(type=service)")]), draft
    )
    assert result.passed is True
    assert result.blocking_flag_rule == "forbidden_met"


def test_gate_required_fails_without_a_blocking_flag() -> None:
    payload = json.loads(
        (FIXTURES / "small_architecture.json").read_text(encoding="utf-8")
    )
    payload["flags"] = []
    draft = ArchitectureDraft.model_validate(payload)
    result = deterministic_gate(prompt(blocking="required"), draft)
    assert result.passed is False
    assert result.blocking_flag_rule == "required_missing"


def test_gate_optional_is_recorded_not_scored() -> None:
    result = deterministic_gate(prompt(blocking="optional"), small())
    assert result.passed is True
    assert result.blocking_flag_rule == "optional_skipped"


def test_gate_records_must_not_include_violations() -> None:
    draft = small()
    result = deterministic_gate(
        prompt(
            must_not_include=[
                item("x01", "component_exists(type=database)")
            ]
        ),
        draft,
    )
    assert result.passed is False
    assert result.failed_items == ("x01",)


def test_gate_ignores_human_items() -> None:
    human = RubricItem(id="r99", statement="Human item.", check="human")
    result = deterministic_gate(prompt(must_include=[human], blocking="optional"), small())
    assert result.passed is True


# -- the small fix: only evaluate.py is checked -----------------------------


def test_only_evaluate_is_checked_for_networkx() -> None:
    source = (REPO_ROOT / "backend" / "app" / "eval" / "evaluate.py").read_text(
        encoding="utf-8"
    )
    assert "networkx" not in source
