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


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_architecture: ArchitectureDraft
    peak_rps: float = Field(default=1000, gt=0, le=10_000_000)
    duration_s: int = Field(default=60, ge=1, le=86400)


class SimulationEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    t_s: float
    severity: Literal["info", "warning", "error"]
    component_id: str | None = None
    connection_id: str | None = None
    message: str


class NodeLoad(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_id: str
    name: str
    type: str
    load_rps: float
    capacity_rps: float
    utilization: float
    bottleneck: bool
    replicas: int
    latency_ms: float
    hourly_cost_usd: float


class Bottleneck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_id: str
    component_name: str
    utilization: float
    dropped_rps: float
    recommendation: str


class SimulationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    peak_rps: float
    duration_s: int
    total_dropped_rps: float
    estimated_cost_usd: float
    node_loads: list[NodeLoad]
    events: list[SimulationEvent]
    bottlenecks: list[Bottleneck]


class CostRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_architecture: ArchitectureDraft


class CostItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_id: str
    name: str
    type: str
    replicas: int
    unit_cost_usd: float
    hourly_cost_usd: float
    monthly_cost_usd: float
    basis: str


class CostResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currency: str = "USD"
    monthly_hours: int = 730
    hourly_total_usd: float
    monthly_total_usd: float
    items: list[CostItem]


class SecurityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_architecture: ArchitectureDraft


class SecurityFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: str
    severity: Literal["critical", "warning", "info"]
    title: str
    message: str
    recommendation: str
    component_id: str | None = None
    connection_id: str | None = None


class SecurityResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passed: bool
    findings: list[SecurityFinding]


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    messages: list[ChatTurn] = Field(default_factory=list, max_length=8)
    current_architecture: ArchitectureDraft | None = None
    selected_id: str | None = Field(default=None, max_length=200)
    selected_kind: Literal["component", "connection", "group"] | None = None
    simulation: SimulationResult | None = None


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
