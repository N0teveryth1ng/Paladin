"""Load and validate the deterministic rule data.

The type-pairing matrix and the required-link rules live in ``rules.json``.
Nothing in this module or in ``validators.py`` hardcodes a pairing or a
required-link type list, so the rules can be reviewed and changed without
touching validator logic.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.model.enums import ComponentType, IssueSeverity

DEFAULT_RULES_PATH = Path(__file__).with_name("rules.json")


class RulesError(Exception):
    """A malformed or internally inconsistent rules file.

    This is a configuration error, not a graph problem. The graph validator
    reports graph problems as ``Issue`` objects; it never raises for them.
    """


class PairingRule(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        populate_by_name=True,
    )

    from_: ComponentType = Field(alias="from")
    to: ComponentType
    severity: IssueSeverity
    reason: str = Field(min_length=1, max_length=400)


class RequiredLinkRule(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_]+$")
    applies_to: ComponentType
    direction: Literal["in", "out", "either"]
    counterpart_types: tuple[ComponentType, ...] = Field(min_length=1)
    min_connections: int = Field(ge=1)
    severity: IssueSeverity
    reason: str = Field(min_length=1, max_length=400)


class RuleSet(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rules_version: str = Field(min_length=1, max_length=20)
    pairing_default: Literal["allowed"]
    pairings: tuple[PairingRule, ...]
    required_links: tuple[RequiredLinkRule, ...]

    def pairing(self, from_type: ComponentType, to_type: ComponentType) -> PairingRule | None:
        """Return the explicit rule for a pair, or None when the pair is allowed."""
        for rule in self.pairings:
            if rule.from_ is from_type and rule.to is to_type:
                return rule
        return None


def _is_invalid(pairings: dict[tuple[ComponentType, ComponentType], PairingRule], pair: tuple[ComponentType, ComponentType]) -> bool:
    rule = pairings.get(pair)
    return rule is not None and rule.severity is IssueSeverity.INVALID


def _check_semantics(rules: RuleSet, path: Path) -> None:
    pairings: dict[tuple[ComponentType, ComponentType], PairingRule] = {}
    for rule in rules.pairings:
        key = (rule.from_, rule.to)
        if key in pairings:
            raise RulesError(
                f"{path}: duplicate pairing {rule.from_.value} -> {rule.to.value}"
            )
        pairings[key] = rule

    seen_ids: set[str] = set()
    for rule in rules.required_links:
        if rule.id in seen_ids:
            raise RulesError(f"{path}: duplicate required link id {rule.id!r}")
        seen_ids.add(rule.id)

        for counterpart in rule.counterpart_types:
            if rule.direction == "out":
                pair = (rule.applies_to, counterpart)
                if _is_invalid(pairings, pair):
                    raise RulesError(
                        f"{path}: rule {rule.id!r} requires invalid pairing "
                        f"{pair[0].value} -> {pair[1].value}"
                    )
            elif rule.direction == "in":
                pair = (counterpart, rule.applies_to)
                if _is_invalid(pairings, pair):
                    raise RulesError(
                        f"{path}: rule {rule.id!r} requires invalid pairing "
                        f"{pair[0].value} -> {pair[1].value}"
                    )
            else:
                # "either" can be satisfied by an edge in either direction,
                # so it is inconsistent only when both directions are invalid.
                forward = (rule.applies_to, counterpart)
                backward = (counterpart, rule.applies_to)
                if _is_invalid(pairings, forward) and _is_invalid(pairings, backward):
                    raise RulesError(
                        f"{path}: rule {rule.id!r} requires an invalid pairing in "
                        f"both directions: {forward[0].value} -> {forward[1].value} "
                        f"and {backward[0].value} -> {backward[1].value}"
                    )


def load_rules(path: str | Path | None = None) -> RuleSet:
    """Load, validate and return an immutable rule set.

    ``path=None`` reads the packaged ``rules.json`` next to this module.
    A malformed or inconsistent file raises ``RulesError`` with the path and
    the offending rule id or pair.
    """

    rules_path = Path(path) if path is not None else DEFAULT_RULES_PATH

    try:
        raw = rules_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RulesError(f"{rules_path}: cannot read rules file: {exc}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RulesError(f"{rules_path}: invalid JSON: {exc}") from exc

    try:
        rules = RuleSet.model_validate(data)
    except ValidationError as exc:
        raise RulesError(f"{rules_path}: invalid rules: {exc}") from exc

    _check_semantics(rules, rules_path)
    return rules
