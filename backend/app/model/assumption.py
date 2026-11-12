"""Visible assumptions and flagged problems.

v1 asks no clarifying questions (project document, Section 8.6). Contradictory
or underspecified requirements must surface here instead of being silently
absorbed, which is what makes the "ask or flag, do not guess" safeguard real.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import AssumptionScope, FlagKind, Severity
from .ids import AssumptionId, FlagId, RequirementId

MAX_ELEMENT_REFS = 20


class Assumption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: AssumptionId
    text: str = Field(
        min_length=1,
        max_length=600,
        description="The assumption, stated plainly so the user can accept or reject it.",
    )
    scope: AssumptionScope = Field(
        description="'global' when it applies to the whole design, 'element' when it is attached to specific elements."
    )
    element_refs: list[str] = Field(
        default_factory=list,
        max_length=MAX_ELEMENT_REFS,
        description="Component, connection or group IDs this assumption applies to. Empty for global assumptions.",
    )
    rationale: str = Field(
        min_length=1,
        max_length=600,
        description="Why the assumption is needed, i.e. what the prompt left open.",
    )


class Flag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: FlagId
    kind: FlagKind
    description: str = Field(
        min_length=1,
        max_length=600,
        description="The problem, naming the conflicting or missing requirement text.",
    )
    requirement_refs: list[RequirementId] = Field(
        default_factory=list,
        max_length=MAX_ELEMENT_REFS,
        description="Requirements involved in the problem.",
    )
    severity: Severity = Field(
        description="'blocking' when the conflict cannot be resolved without the user; the design is still delivered."
    )
    resolved_by: AssumptionId | None = Field(
        default=None,
        description="The assumption that resolves the flag. Must be null for blocking flags.",
    )

    @model_validator(mode="after")
    def _check_blocking(self) -> "Flag":
        if len(set(self.requirement_refs)) != len(self.requirement_refs):
            raise ValueError("requirement_refs must not contain duplicates")
        if self.severity is Severity.BLOCKING and self.resolved_by is not None:
            raise ValueError(
                "a blocking flag cannot be resolved by an assumption; set resolved_by to null"
            )
        return self
