"""Traceability mixin shared by Component, Connection and Group.

Project document v1.2, Section 5: every element links to a requirement, or is
explicitly tagged as an assumption. The boolean flag is deliberate: a free
model must answer the question for every element, and a missing answer is a
schema violation rather than a silent default.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .ids import RequirementId

MAX_REQUIREMENT_REFS = 20
MAX_RATIONALE_LEN = 600


class Traced(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requirement_refs: list[RequirementId] = Field(
        default_factory=list,
        max_length=MAX_REQUIREMENT_REFS,
        description=(
            "IDs of the requirements this element serves. Must be non-empty when "
            "assumed is false."
        ),
    )
    assumed: bool = Field(
        description=(
            "True when this element is not derived from a stated requirement but "
            "from an assumption or a recommendation. Required on every element."
        ),
    )
    rationale: str | None = Field(
        default=None,
        max_length=MAX_RATIONALE_LEN,
        description="Why this element exists or why it is assumed. Required when assumed is true.",
    )

    @model_validator(mode="after")
    def _check_trace(self) -> "Traced":
        if len(set(self.requirement_refs)) != len(self.requirement_refs):
            raise ValueError("requirement_refs must not contain duplicates")

        if self.assumed:
            if self.rationale is None or not self.rationale.strip():
                raise ValueError(
                    "assumed=True requires a non-empty rationale: an assumption must be stated, not hidden"
                )
        else:
            if not self.requirement_refs:
                raise ValueError(
                    "assumed=False requires at least one requirement_ref: nothing may appear as fact without a basis"
                )
        return self
