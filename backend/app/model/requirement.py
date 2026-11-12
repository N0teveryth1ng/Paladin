"""Requirements are first-class so that traceability is machine-checkable."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .enums import RequirementKind, RequirementSource
from .ids import RequirementId


class Requirement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: RequirementId
    text: str = Field(
        min_length=1,
        max_length=600,
        description="The requirement as stated in the prompt, or a near-verbatim restatement.",
    )
    kind: RequirementKind
    source: RequirementSource = Field(
        description="'prompt' when stated by the user, 'inferred' when derived from the prompt."
    )
