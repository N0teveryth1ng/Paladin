"""A group is a container for components, not a graph node.

Cardinality rules (v1): a component belongs to at most one group, and group
nesting is one level deep. Both are soft-checked in ArchitectureDraft so that
step 4 can report them instead of crashing.
"""

from __future__ import annotations

from pydantic import Field, field_validator

from .ids import ComponentId, GroupId
from .trace import Traced

MAX_GROUP_MEMBERS = 40


class Group(Traced):
    id: GroupId
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(
        min_length=1,
        max_length=400,
        description="What this boundary represents, e.g. a tier, a domain, or a deployment unit.",
    )
    members: list[ComponentId] = Field(
        min_length=1,
        max_length=MAX_GROUP_MEMBERS,
        description="Component IDs contained in this group.",
    )
    parent_id: GroupId | None = Field(
        default=None,
        description="Parent group ID. At most one level of nesting in v1.",
    )

    @field_validator("members")
    @classmethod
    def _unique_members(cls, value: list[ComponentId]) -> list[ComponentId]:
        if len(set(value)) != len(value):
            raise ValueError("group members must not contain duplicates")
        return value
