"""Rule-data tests: schema, coverage, consistency, and the data-driven proof."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.model.enums import ComponentType, IssueKind, IssueSeverity
from app.validation import RuleSet, RulesError, load_rules, validate_graph
from app.model import ArchitectureDraft

BACKEND = Path(__file__).resolve().parents[1]
SHIPPED_PATH = BACKEND / "app" / "validation" / "rules.json"
FIXTURES = Path(__file__).parent / "fixtures"


def shipped_data() -> dict[str, Any]:
    return json.loads(SHIPPED_PATH.read_text(encoding="utf-8"))


def write_rules(tmp_path: Path, data: dict[str, Any]) -> Path:
    path = tmp_path / "rules.json"
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return path


def small() -> ArchitectureDraft:
    raw = json.loads((FIXTURES / "small_architecture.json").read_text(encoding="utf-8"))
    return ArchitectureDraft.model_validate(raw)


# 1 ---------------------------------------------------------------------
def test_shipped_rules_load_with_version_and_default() -> None:
    rules = load_rules()

    assert isinstance(rules, RuleSet)
    assert rules.rules_version == "1.0"
    assert rules.pairing_default == "allowed"


# 2 ---------------------------------------------------------------------
def test_every_type_in_the_rules_is_a_real_component_type() -> None:
    rules = load_rules()
    known = set(ComponentType)

    for pairing in rules.pairings:
        assert pairing.from_ in known
        assert pairing.to in known

    for rule in rules.required_links:
        assert rule.applies_to in known
        assert set(rule.counterpart_types) <= known


# 3 ---------------------------------------------------------------------
def test_no_duplicate_pairings_or_rule_ids_and_every_reason_is_present() -> None:
    rules = load_rules()

    pairs = [(pairing.from_, pairing.to) for pairing in rules.pairings]
    assert len(set(pairs)) == len(pairs)

    ids = [rule.id for rule in rules.required_links]
    assert len(set(ids)) == len(ids)

    for pairing in rules.pairings:
        assert pairing.reason.strip()
    for rule in rules.required_links:
        assert rule.reason.strip()


# 4 ---------------------------------------------------------------------
def test_severity_direction_and_min_connections_are_bounded() -> None:
    rules = load_rules()

    for pairing in rules.pairings:
        assert pairing.severity in {IssueSeverity.INVALID, IssueSeverity.JUDGMENT}

    for rule in rules.required_links:
        assert rule.severity in {IssueSeverity.INVALID, IssueSeverity.JUDGMENT}
        assert rule.direction in {"in", "out", "either"}
        assert rule.min_connections >= 1


# 5 ---------------------------------------------------------------------
def test_every_component_type_is_referenced_somewhere() -> None:
    rules = load_rules()

    referenced: set[ComponentType] = set()
    for pairing in rules.pairings:
        referenced.add(pairing.from_)
        referenced.add(pairing.to)
    for rule in rules.required_links:
        referenced.add(rule.applies_to)
        referenced.update(rule.counterpart_types)

    assert referenced == set(ComponentType)


# 6 ---------------------------------------------------------------------
def test_required_links_never_depend_on_an_invalid_pairing() -> None:
    rules = load_rules()

    for rule in rules.required_links:
        for counterpart in rule.counterpart_types:
            if rule.direction == "out":
                pairs = [(rule.applies_to, counterpart)]
            elif rule.direction == "in":
                pairs = [(counterpart, rule.applies_to)]
            else:
                forward = (rule.applies_to, counterpart)
                backward = (counterpart, rule.applies_to)
                forward_rule = rules.pairing(*forward)
                backward_rule = rules.pairing(*backward)
                assert not (
                    forward_rule is not None
                    and forward_rule.severity is IssueSeverity.INVALID
                    and backward_rule is not None
                    and backward_rule.severity is IssueSeverity.INVALID
                ), (
                    f"rule {rule.id!r} depends on invalid pairings in both directions: "
                    f"{forward[0].value} -> {forward[1].value} and "
                    f"{backward[0].value} -> {backward[1].value}"
                )
                continue

            for pair in pairs:
                pairing = rules.pairing(*pair)
                assert pairing is None or pairing.severity is not IssueSeverity.INVALID, (
                    f"rule {rule.id!r} depends on invalid pairing "
                    f"{pair[0].value} -> {pair[1].value}"
                )


# 7 ---------------------------------------------------------------------
def test_loader_rejects_an_unknown_component_type(tmp_path: Path) -> None:
    data = shipped_data()
    data["pairings"][0]["to"] = "quantum_computer"

    with pytest.raises(RulesError) as excinfo:
        load_rules(write_rules(tmp_path, data))
    assert "rules.json" in str(excinfo.value)


def test_loader_rejects_a_duplicate_pairing(tmp_path: Path) -> None:
    data = shipped_data()
    data["pairings"].append(dict(data["pairings"][0]))

    with pytest.raises(RulesError) as excinfo:
        load_rules(write_rules(tmp_path, data))
    assert "duplicate pairing" in str(excinfo.value)


def test_loader_rejects_a_duplicate_rule_id(tmp_path: Path) -> None:
    data = shipped_data()
    data["required_links"].append(dict(data["required_links"][0]))

    with pytest.raises(RulesError) as excinfo:
        load_rules(write_rules(tmp_path, data))
    assert "duplicate required link id" in str(excinfo.value)


def test_loader_rejects_an_unknown_severity(tmp_path: Path) -> None:
    data = shipped_data()
    data["pairings"][0]["severity"] = "fatal"

    with pytest.raises(RulesError):
        load_rules(write_rules(tmp_path, data))


def test_loader_rejects_zero_min_connections(tmp_path: Path) -> None:
    data = shipped_data()
    data["required_links"][0]["min_connections"] = 0

    with pytest.raises(RulesError):
        load_rules(write_rules(tmp_path, data))


def test_loader_rejects_an_unknown_direction(tmp_path: Path) -> None:
    data = shipped_data()
    data["required_links"][0]["direction"] = "sideways"

    with pytest.raises(RulesError):
        load_rules(write_rules(tmp_path, data))


def test_loader_rejects_a_required_link_with_an_invalid_counterpart(
    tmp_path: Path,
) -> None:
    data = shipped_data()
    data["required_links"].append(
        {
            "id": "bad_client_database_link",
            "applies_to": "client",
            "direction": "out",
            "counterpart_types": ["database"],
            "min_connections": 1,
            "severity": "invalid",
            "reason": "test rule",
        }
    )

    with pytest.raises(RulesError) as excinfo:
        load_rules(write_rules(tmp_path, data))
    assert "bad_client_database_link" in str(excinfo.value)


def test_loader_rejects_a_missing_rules_version(tmp_path: Path) -> None:
    data = shipped_data()
    del data["rules_version"]

    with pytest.raises(RulesError):
        load_rules(write_rules(tmp_path, data))


# 8 ---------------------------------------------------------------------
def test_rules_are_data_not_code(tmp_path: Path) -> None:
    draft = small()

    shipped = validate_graph(draft)
    assert not [issue for issue in shipped if issue.kind is IssueKind.INVALID_TYPE_PAIRING]

    data = shipped_data()
    data["pairings"].append(
        {
            "from": "client",
            "to": "api_gateway",
            "severity": "invalid",
            "reason": "temporary test rule",
        }
    )
    changed = validate_graph(draft, rules=load_rules(write_rules(tmp_path, data)))

    invalid = [
        issue for issue in changed if issue.kind is IssueKind.INVALID_TYPE_PAIRING
    ]
    assert len(invalid) == 1
    assert invalid[0].element_id == "cnx_client_gateway"


# 9 ---------------------------------------------------------------------
def test_two_loads_are_equal_and_the_rule_set_is_immutable() -> None:
    first = load_rules()
    second = load_rules()

    assert first == second
    assert isinstance(first.pairings, tuple)
    assert isinstance(first.required_links, tuple)

    with pytest.raises(ValidationError):
        first.pairings[0].severity = IssueSeverity.JUDGMENT
    with pytest.raises(ValidationError):
        first.required_links[0].id = "renamed"
