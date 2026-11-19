"""Request and response models for the local generation API.

None of these models carries a provider key, base URL, raw provider payload or
system prompt. Only the health response exposes the selected model name.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)


class IssueResponse(BaseModel):
    kind: str
    severity: str
    element_id: str | None = None
    message: str


class RunResult(BaseModel):
    draft: dict[str, Any]
    issues: list[IssueResponse]
    rules_version: str


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class RunAccepted(BaseModel):
    run_id: str
    state: str
    started_at: str
    max_run_seconds: int


class RunStatus(BaseModel):
    run_id: str
    state: str
    elapsed_ms: int
    max_run_seconds: int
    result: RunResult | None = None
    error: ErrorDetail | None = None


class HealthResponse(BaseModel):
    status: str
    model: str
    message: str | None = None
    system_prompt_version: str
    rules_version: str
    max_run_seconds: int
