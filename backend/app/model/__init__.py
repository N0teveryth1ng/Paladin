"""Public surface of the architecture model."""

from .architecture import Architecture, ArchitectureDraft
from .assumption import Assumption, Flag
from .attributes import CONSISTENCY_MODELS, PROTOCOLS, RESERVED_KEYS, validate_attributes
from .component import Component
from .connection import Connection
from .enums import (
    AssumptionScope,
    ComponentType,
    ConnectionType,
    Domain,
    FlagKind,
    IssueKind,
    RequirementKind,
    RequirementSource,
    Severity,
)
from .group import Group
from .ids import (
    AssumptionId,
    ComponentId,
    ConnectionId,
    FlagId,
    GroupId,
    RequirementId,
)
from .issues import Issue
from .meta import SCHEMA_VERSION, RunMeta
from .requirement import Requirement
from .trace import Traced

__all__ = [
    "Architecture",
    "ArchitectureDraft",
    "Assumption",
    "AssumptionId",
    "AssumptionScope",
    "Component",
    "ComponentId",
    "ComponentType",
    "Connection",
    "ConnectionId",
    "ConnectionType",
    "CONSISTENCY_MODELS",
    "Domain",
    "Flag",
    "FlagId",
    "FlagKind",
    "Group",
    "GroupId",
    "Issue",
    "IssueKind",
    "PROTOCOLS",
    "RESERVED_KEYS",
    "Requirement",
    "RequirementId",
    "RequirementKind",
    "RequirementSource",
    "RunMeta",
    "SCHEMA_VERSION",
    "Severity",
    "Traced",
    "validate_attributes",
]
