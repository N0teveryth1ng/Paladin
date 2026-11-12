"""Constrained identifier types.

Every element kind has its own prefix so that a dangling reference is
self-evident in an error message, and so cross-collection collisions are
impossible by construction.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import StringConstraints

ID_BODY = r"[a-z0-9_]{1,40}"


def _prefixed(prefix: str) -> type[str]:
    return Annotated[str, StringConstraints(pattern=rf"^{prefix}{ID_BODY}$")]


RequirementId = _prefixed("req_")
ComponentId = _prefixed("cmp_")
ConnectionId = _prefixed("cnx_")
GroupId = _prefixed("grp_")
AssumptionId = _prefixed("asm_")
FlagId = _prefixed("flg_")
