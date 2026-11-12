"""Run envelope, injected by the harness after generation.

The AI never produces these fields: they are provenance, not architecture.
The generation schema therefore excludes them entirely.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1.0"


class RunMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=1, max_length=80, description="e.g. 'zhipu' or 'openrouter'.")
    model: str = Field(min_length=1, max_length=120, description="Model identifier as sent to the endpoint.")
    base_url: str = Field(
        min_length=1,
        max_length=300,
        description="OpenAI-compatible base URL used for the run.",
    )
    generated_at: datetime = Field(description="UTC timestamp of generation.")
