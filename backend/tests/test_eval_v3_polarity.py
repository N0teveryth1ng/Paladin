"""Real gate tests for every v3 polarity case.

Each case builds a known-good minimal graph and a known-bad graph, then calls
``deterministic_gate`` with a real rubric item. Human scoring and provider calls
are not involved.
"""

from __future__ import annotations

from typing import Any

from app.eval.evaluate import deterministic_gate
from app.eval.models import EvalPrompt, RubricItem
from app.model.architecture import ArchitectureDraft


def make_draft(
    components: list[tuple[str, str]],
    connections: list[tuple[str, str, str, str, str]] | None = None,
    flags: list[dict[str, Any]] | None = None,
    assumptions: list[dict[str, Any]] | None = None,
) -> ArchitectureDraft:
    return ArchitectureDraft.model_validate(
        {
            "title": "Polarity test",
            "summary": "A minimal graph for gate polarity checks.",
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
                for connection_id, source, target, connection_type, label in (
                    connections or []
                )
            ],
            "groups": [],
            "assumptions": assumptions or [],
            "flags": flags or [],
        }
    )


def blocking_flag() -> dict[str, Any]:
    return {
        "id": "flg_block",
        "kind": "contradiction",
        "description": "The stated requirements cannot all hold.",
        "requirement_refs": ["req_base"],
        "severity": "blocking",
        "resolved_by": None,
    }


def prompt(
    *,
    must_include: list[RubricItem] | None = None,
    must_not_include: list[RubricItem] | None = None,
    blocking: str = "forbidden",
) -> EvalPrompt:
    return EvalPrompt(
        id="ev3_99",
        title="Polarity test prompt",
        category="simple",
        prompt="A polarity test prompt.",
        expected_requirements=[],
        must_include=must_include or [],
        must_not_include=must_not_include or [],
        blocking_flag_expected=blocking,
    )


def item(iid: str, predicate: str) -> RubricItem:
    return RubricItem(
        id=iid,
        statement=f"Gate item {iid}.",
        check="deterministic",
        predicate=predicate,
    )


def minimal_graph() -> ArchitectureDraft:
    return make_draft(
        components=[
            ("cmp_client", "client"),
            ("cmp_service", "service"),
            ("cmp_db", "database"),
        ],
        connections=[
            ("cnx_client_service", "cmp_client", "cmp_service", "sync", "requests"),
            ("cnx_service_db", "cmp_service", "cmp_db", "sync", "reads and writes"),
        ],
    )


# 1. must_include positive predicate: present passes, absent fails


def test_must_include_positive_predicate_gate() -> None:
    rubric = prompt(must_include=[item("r01", "component_exists(type=service)")])
    good = deterministic_gate(rubric, minimal_graph())
    assert good.passed is True
    assert good.failed_items == ()

    bad = deterministic_gate(
        rubric,
        make_draft(
            components=[("cmp_client", "client"), ("cmp_db", "database")],
            connections=[("cnx_direct", "cmp_client", "cmp_db", "sync", "writes directly")],
        ),
    )
    assert bad.passed is False
    assert bad.failed_items == ("r01",)


# 2. must_include no_reference_issues: clean passes, dangling fails


def test_must_include_no_reference_issues_gate() -> None:
    rubric = prompt(must_include=[item("r01", "no_reference_issues()")])
    good = deterministic_gate(rubric, minimal_graph())
    assert good.passed is True

    bad_draft = make_draft(
        components=[
            ("cmp_client", "client"),
            ("cmp_service", "service"),
            ("cmp_db", "database"),
        ],
        connections=[
            ("cnx_client_service", "cmp_client", "cmp_service", "sync", "requests"),
            ("cnx_service_db", "cmp_service", "cmp_db", "sync", "reads and writes"),
            ("cnx_dangling", "cmp_missing", "cmp_db", "sync", "broken"),
        ],
    )
    bad = deterministic_gate(rubric, bad_draft)
    assert bad.passed is False
    assert bad.failed_items == ("r01",)


# 3. must_include no_connection: indirect passes, direct fails


def test_must_include_no_connection_gate() -> None:
    rubric = prompt(
        must_include=[item("r01", "no_connection(from_type=client, to_type=database)")]
    )
    good = deterministic_gate(rubric, minimal_graph())
    assert good.passed is True

    bad = deterministic_gate(
        rubric,
        make_draft(
            components=[("cmp_client", "client"), ("cmp_db", "database")],
            connections=[("cnx_direct", "cmp_client", "cmp_db", "sync", "writes directly")],
        ),
    )
    assert bad.passed is False
    assert bad.failed_items == ("r01",)


# 4. must_not_include positive component_exists: absent passes, present fails


def test_must_not_positive_component_exists_gate() -> None:
    rubric = prompt(must_not_include=[item("x01", "component_exists(type=cdn)")])
    good = deterministic_gate(rubric, minimal_graph())
    assert good.passed is True

    bad = deterministic_gate(
        rubric,
        make_draft(
            components=[
                ("cmp_client", "client"),
                ("cmp_cdn", "cdn"),
                ("cmp_service", "service"),
                ("cmp_db", "database"),
            ],
            connections=[
                ("cnx_client_cdn", "cmp_client", "cmp_cdn", "sync", "requests"),
                ("cnx_cdn_service", "cmp_cdn", "cmp_service", "sync", "forwards"),
                ("cnx_service_db", "cmp_service", "cmp_db", "sync", "writes"),
            ],
        ),
    )
    assert bad.passed is False
    assert bad.failed_items == ("x01",)


# 5. blocking_flag_expected forbidden: absent passes, present fails


def test_blocking_flag_rule_forbidden_gate() -> None:
    rubric = prompt()
    good = deterministic_gate(rubric, minimal_graph())
    assert good.passed is True
    assert good.blocking_flag_rule == "forbidden_met"

    bad = deterministic_gate(
        rubric,
        make_draft(
            components=[("cmp_client", "client"), ("cmp_service", "service")],
            flags=[blocking_flag()],
        ),
    )
    assert bad.passed is False
    assert bad.blocking_flag_rule == "forbidden_violated"


# 6. blocking_flag_expected required: present passes, absent fails


def test_blocking_flag_rule_required_gate() -> None:
    rubric = prompt(
        must_include=[item("r01", "flag_present(kind=contradiction, severity=blocking)")],
        blocking="required",
    )
    good = deterministic_gate(
        rubric,
        make_draft(
            components=[("cmp_client", "client"), ("cmp_service", "service")],
            flags=[blocking_flag()],
        ),
    )
    assert good.passed is True
    assert good.blocking_flag_rule == "required_met"

    bad = deterministic_gate(rubric, minimal_graph())
    assert bad.passed is False
    assert bad.failed_items == ("r01",)
    assert bad.blocking_flag_rule == "required_missing"


# 7. assumption_present: present passes, absent fails (ev3_14 shape)


def test_assumption_present_gate() -> None:
    rubric = prompt(must_include=[item("r03", 'assumption_present(text~="approv")')])
    good = deterministic_gate(
        rubric,
        make_draft(
            components=[
                ("cmp_client", "client"),
                ("cmp_service", "service"),
                ("cmp_db", "database"),
            ],
            connections=[
                ("cnx_client_service", "cmp_client", "cmp_service", "sync", "requests"),
                ("cnx_service_db", "cmp_service", "cmp_db", "sync", "writes"),
            ],
            assumptions=[
                {
                    "id": "asm_approval",
                    "text": "Approval is handled by a coordinator role.",
                    "scope": "global",
                    "element_refs": [],
                    "rationale": "The prompt states that who approves activities is undecided.",
                }
            ],
        ),
    )
    assert good.passed is True
    assert good.failed_items == ()

    bad = deterministic_gate(rubric, minimal_graph())
    assert bad.passed is False
    assert bad.failed_items == ("r03",)


# 8. component_count(lte=N): small passes, large fails (ev3_14 shape)


def test_component_count_gate() -> None:
    rubric = prompt(must_include=[item("r01", "component_count(lte=6)")])
    good = deterministic_gate(rubric, minimal_graph())
    assert good.passed is True

    bad = deterministic_gate(
        rubric,
        make_draft(
            components=[
                ("cmp_client", "client"),
                ("cmp_service", "service"),
                ("cmp_db", "database"),
                ("cmp_cache", "cache"),
                ("cmp_queue", "message_queue"),
                ("cmp_worker", "service"),
                ("cmp_lb", "load_balancer"),
            ],
        ),
    )
    assert bad.passed is False
    assert bad.failed_items == ("r01",)
