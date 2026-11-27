"""Request and response models for the local generation API.

None of these models carries a provider key, base URL, raw provider payload or
system prompt. Only the health response exposes the selected model name.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.model.architecture import ArchitectureDraft


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)


class UpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request: str = Field(min_length=1, max_length=2000)
    current_architecture: ArchitectureDraft


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1600)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatTurn] = Field(min_length=1, max_length=8)
    architecture_context: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _last_turn_is_user(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last chat message must be from the user")
        return self


class ChatResponse(BaseModel):
    reply: str = Field(min_length=1, max_length=4000)


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    messages: list[ChatTurn] = Field(default_factory=list, max_length=8)
    current_architecture: ArchitectureDraft | None = None
    selected_id: str | None = Field(default=None, max_length=200)
    selected_kind: Literal["component", "connection", "group"] | None = None


class PatchOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal[
        "set_title",
        "set_summary",
        "add_component",
        "update_component",
        "remove_component",
        "add_connection",
        "update_connection",
        "remove_connection",
        "add_group",
        "update_group",
        "remove_group",
        "bulk",
    ]
    id: str | None = None
    name: str | None = None
    summary: str | None = None
    component: dict[str, Any] | None = None
    connection: dict[str, Any] | None = None
    group: dict[str, Any] | None = None
    patch: dict[str, Any] | None = None
    operations: list[dict[str, Any]] | None = None


class AssistantResponse(BaseModel):
    kind: Literal["chat", "small_edit", "major_redesign", "review"]
    reply: str = Field(min_length=1, max_length=4000)
    operations: list[PatchOperation] = Field(default_factory=list)
    redesign_prompt: str | None = Field(default=None, max_length=2000)


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
