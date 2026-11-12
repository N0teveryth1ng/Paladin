"""The architecture graph.

Two models, one graph:

* ArchitectureDraft -- exactly what the AI emits. This is the contract that
  architecture.generation.schema.json describes.
* Architecture -- the stored record. The harness injects schema_version,
  prompt, domain and meta after generation; the AI never produces them.

Hard failures are shape errors. Meaning errors (dangling references, bad group
cardinality) are returned by check_references() so they can be reported rather
than crash the pipeline.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .assumption import Assumption, Flag
from .component import Component
from .connection import Connection
from .enums import Domain, IssueKind
from .group import Group
from .issues import Issue
from .meta import SCHEMA_VERSION, RunMeta
from .requirement import Requirement

MAX_REQUIREMENTS = 40
MAX_COMPONENTS = 120
MAX_CONNECTIONS = 300
MAX_GROUPS = 20
MAX_ASSUMPTIONS = 40
MAX_FLAGS = 20


class ArchitectureDraft(BaseModel):
    """What the AI emits. Contains structure and meaning, never geometry."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(
        min_length=1,
        max_length=800,
        description="A short prose description of the design and its main trade-offs.",
    )
    requirements: list[Requirement] = Field(min_length=1, max_length=MAX_REQUIREMENTS)
    components: list[Component] = Field(min_length=1, max_length=MAX_COMPONENTS)
    connections: list[Connection] = Field(default_factory=list, max_length=MAX_CONNECTIONS)
    groups: list[Group] = Field(default_factory=list, max_length=MAX_GROUPS)
    assumptions: list[Assumption] = Field(default_factory=list, max_length=MAX_ASSUMPTIONS)
    flags: list[Flag] = Field(default_factory=list, max_length=MAX_FLAGS)

    @model_validator(mode="after")
    def _unique_ids(self) -> "ArchitectureDraft":
        for name, items in (
            ("requirements", self.requirements),
            ("components", self.components),
            ("connections", self.connections),
            ("groups", self.groups),
            ("assumptions", self.assumptions),
            ("flags", self.flags),
        ):
            ids = [item.id for item in items]
            if len(set(ids)) != len(ids):
                duplicates = sorted({i for i in ids if ids.count(i) > 1})
                raise ValueError(f"duplicate ids in {name}: {duplicates}")
        return self

    # -- soft referential integrity -------------------------------------

    def component_ids(self) -> set[str]:
        return {c.id for c in self.components}

    def connection_ids(self) -> set[str]:
        return {c.id for c in self.connections}

    def group_ids(self) -> set[str]:
        return {g.id for g in self.groups}

    def requirement_ids(self) -> set[str]:
        return {r.id for r in self.requirements}

    def assumption_ids(self) -> set[str]:
        return {a.id for a in self.assumptions}

    def check_references(self) -> list[Issue]:
        """Return every referential problem found. Never raises."""

        issues: list[Issue] = []
        components = self.component_ids()
        connections = self.connection_ids()
        groups = {g.id: g for g in self.groups}
        requirements = self.requirement_ids()
        assumptions = self.assumption_ids()

        for connection in self.connections:
            if connection.from_ not in components:
                issues.append(
                    Issue(
                        kind=IssueKind.DANGLING_CONNECTION_SOURCE,
                        message=(
                            f"connection {connection.id!r} starts at unknown component "
                            f"{connection.from_!r}"
                        ),
                        element_id=connection.id,
                    )
                )
            if connection.to not in components:
                issues.append(
                    Issue(
                        kind=IssueKind.DANGLING_CONNECTION_TARGET,
                        message=(
                            f"connection {connection.id!r} ends at unknown component "
                            f"{connection.to!r}"
                        ),
                        element_id=connection.id,
                    )
                )

        membership: dict[str, list[str]] = {}
        for group in self.groups:
            if group.parent_id is not None:
                if group.parent_id == group.id:
                    issues.append(
                        Issue(
                            kind=IssueKind.SELF_PARENT_GROUP,
                            message=f"group {group.id!r} is its own parent",
                            element_id=group.id,
                        )
                    )
                elif group.parent_id not in groups:
                    issues.append(
                        Issue(
                            kind=IssueKind.UNKNOWN_GROUP_PARENT,
                            message=(
                                f"group {group.id!r} has unknown parent "
                                f"{group.parent_id!r}"
                            ),
                            element_id=group.id,
                        )
                    )
                elif groups[group.parent_id].parent_id is not None:
                    issues.append(
                        Issue(
                            kind=IssueKind.GROUP_NESTING_TOO_DEEP,
                            message=(
                                f"group {group.id!r} is nested under {group.parent_id!r}, "
                                "which already has a parent (v1 allows one level)"
                            ),
                            element_id=group.id,
                        )
                    )

            for member in group.members:
                if member not in components:
                    issues.append(
                        Issue(
                            kind=IssueKind.UNKNOWN_GROUP_MEMBER,
                            message=f"group {group.id!r} contains unknown component {member!r}",
                            element_id=group.id,
                        )
                    )
                membership.setdefault(member, []).append(group.id)

        for component_id, group_ids in membership.items():
            if len(group_ids) > 1:
                issues.append(
                    Issue(
                        kind=IssueKind.COMPONENT_IN_MULTIPLE_GROUPS,
                        message=(
                            f"component {component_id!r} belongs to multiple groups: "
                            f"{sorted(group_ids)}"
                        ),
                        element_id=component_id,
                    )
                )

        for element in (*self.components, *self.connections, *self.groups):
            for ref in element.requirement_refs:
                if ref not in requirements:
                    issues.append(
                        Issue(
                            kind=IssueKind.UNKNOWN_REQUIREMENT_REF,
                            message=f"element {element.id!r} references unknown requirement {ref!r}",
                            element_id=element.id,
                        )
                    )

        for flag in self.flags:
            for ref in flag.requirement_refs:
                if ref not in requirements:
                    issues.append(
                        Issue(
                            kind=IssueKind.UNKNOWN_REQUIREMENT_REF,
                            message=f"flag {flag.id!r} references unknown requirement {ref!r}",
                            element_id=flag.id,
                        )
                    )
            if flag.resolved_by is not None and flag.resolved_by not in assumptions:
                issues.append(
                    Issue(
                        kind=IssueKind.UNKNOWN_ASSUMPTION_REF,
                        message=(
                            f"flag {flag.id!r} is resolved by unknown assumption "
                            f"{flag.resolved_by!r}"
                        ),
                        element_id=flag.id,
                    )
                )

        known_elements = components | connections | set(groups)
        for assumption in self.assumptions:
            for ref in assumption.element_refs:
                if ref not in known_elements:
                    issues.append(
                        Issue(
                            kind=IssueKind.UNKNOWN_ELEMENT_REF,
                            message=(
                                f"assumption {assumption.id!r} references unknown element "
                                f"{ref!r}"
                            ),
                            element_id=assumption.id,
                        )
                    )

        return issues


class Architecture(ArchitectureDraft):
    """The stored record: the draft plus harness-injected provenance."""

    schema_version: Literal["1.0"] = Field(
        description=f"Injected by the harness. Current version is {SCHEMA_VERSION!r}."
    )
    prompt: str = Field(
        min_length=1,
        max_length=8000,
        description="The user prompt, verbatim, for traceability and evaluation.",
    )
    domain: Domain = Field(
        description="Injected by the harness. v1 supports only 'web_backend'."
    )
    meta: RunMeta = Field(description="Injected by the harness: provider, model, base URL, timestamp.")
