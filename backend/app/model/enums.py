"""Enumerations for the architecture graph.

These are frozen by project document v1.2, Section 8. The component and
connection enums are consumed by step 4 (type-pairing matrix) and step 5
(node rendering), so they must not drift.
"""

from __future__ import annotations

from enum import Enum


class Domain(str, Enum):
    """v1 supports exactly one domain. Widening becomes an explicit change."""

    WEB_BACKEND = "web_backend"


class ComponentType(str, Enum):
    CLIENT = "client"
    API_GATEWAY = "api_gateway"
    LOAD_BALANCER = "load_balancer"
    SERVICE = "service"
    WORKER = "worker"
    DATABASE = "database"
    CACHE = "cache"
    MESSAGE_QUEUE = "message_queue"
    OBJECT_STORAGE = "object_storage"
    CDN = "cdn"
    AUTH_PROVIDER = "auth_provider"
    SEARCH_INDEX = "search_index"
    SCHEDULER = "scheduler"
    EXTERNAL_SERVICE = "external_service"


class ConnectionType(str, Enum):
    SYNC = "sync"
    ASYNC = "async"


class RequirementKind(str, Enum):
    FUNCTIONAL = "functional"
    NON_FUNCTIONAL = "non_functional"
    CONSTRAINT = "constraint"


class RequirementSource(str, Enum):
    PROMPT = "prompt"
    INFERRED = "inferred"


class AssumptionScope(str, Enum):
    GLOBAL = "global"
    ELEMENT = "element"


class FlagKind(str, Enum):
    CONTRADICTION = "contradiction"
    UNDERSPECIFIED = "underspecified"
    UNVERIFIABLE = "unverifiable"


class Severity(str, Enum):
    BLOCKING = "blocking"
    WARNING = "warning"


class IssueKind(str, Enum):
    """Soft referential-integrity findings from ArchitectureDraft.check_references()."""

    DANGLING_CONNECTION_SOURCE = "dangling_connection_source"
    DANGLING_CONNECTION_TARGET = "dangling_connection_target"
    UNKNOWN_GROUP_MEMBER = "unknown_group_member"
    UNKNOWN_GROUP_PARENT = "unknown_group_parent"
    SELF_PARENT_GROUP = "self_parent_group"
    GROUP_NESTING_TOO_DEEP = "group_nesting_too_deep"
    COMPONENT_IN_MULTIPLE_GROUPS = "component_in_multiple_groups"
    UNKNOWN_REQUIREMENT_REF = "unknown_requirement_ref"
    UNKNOWN_ASSUMPTION_REF = "unknown_assumption_ref"
    UNKNOWN_ELEMENT_REF = "unknown_element_ref"
