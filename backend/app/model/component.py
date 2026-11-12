"""A component is a node in the architecture graph. It has no geometry."""

from __future__ import annotations

from pydantic import Field, field_validator

from .attributes import ATTRIBUTES_DESCRIPTION, MAX_ATTRIBUTES, validate_attributes
from .enums import ComponentType
from .ids import ComponentId
from .trace import Traced


class Component(Traced):
    id: ComponentId
    type: ComponentType
    name: str = Field(min_length=1, max_length=80)
    technology: str | None = Field(
        default=None,
        min_length=1,
        max_length=60,
        description=(
            "Optional concrete technology label, e.g. 'Kafka' for a message_queue. "
            "v1 abstraction level: generic type plus optional technology."
        ),
    )
    description: str = Field(
        min_length=1,
        max_length=400,
        description="What this component is responsible for, in one or two sentences.",
    )
    attributes: dict[str, str] = Field(
        default_factory=dict,
        max_length=MAX_ATTRIBUTES,
        description=ATTRIBUTES_DESCRIPTION,
    )

    @field_validator("attributes")
    @classmethod
    def _validate_attributes(cls, value: dict[str, str]) -> dict[str, str]:
        return validate_attributes(value)
