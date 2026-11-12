"""A connection is a directed edge. Two types only: sync and async."""

from __future__ import annotations

from pydantic import ConfigDict, Field

from .enums import ConnectionType
from .ids import ComponentId, ConnectionId
from .trace import Traced


class Connection(Traced):
    # 'from' is a Python keyword, so the attribute is from_ and the wire name is 'from'.
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
    )

    id: ConnectionId
    from_: ComponentId = Field(
        alias="from",
        description="ID of the component the connection starts at.",
    )
    to: ComponentId = Field(
        description="ID of the component the connection ends at.",
    )
    type: ConnectionType = Field(
        description="'sync' for request/response, 'async' for fire-and-forget or streaming."
    )
    label: str = Field(
        min_length=1,
        max_length=80,
        description="What flows or what the call does, e.g. 'publishes transcode jobs'.",
    )
    technology: str | None = Field(
        default=None,
        min_length=1,
        max_length=60,
        description="Optional concrete technology label, e.g. 'gRPC' or 'Kafka'.",
    )
