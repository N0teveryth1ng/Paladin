"""Soft referential-integrity findings.

These are reported, never raised. Hard failures are reserved for shape errors
(unknown enum value, unknown field, malformed ID, violated traceability
invariant). Meaning errors are reported so step 4 can explain them to the user.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .enums import IssueKind


class Issue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: IssueKind
    message: str = Field(min_length=1, max_length=400)
    element_id: str | None = Field(
        default=None,
        description="The element the issue was found on, when one applies.",
    )
