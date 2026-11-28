"""The local FastAPI application: loopback bind, narrow CORS, no fake paths."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.config import (
    FreezeError,
    RUN_MARGIN_S,
    StartupBundle,
    derive_max_run_seconds,
    load_freeze,
    startup_check,
)
from app.api.analysis import analyze_cost, analyze_security, simulate
from app.api.assistant import run_assistant
from app.api.chat import respond_to_chat
from app.api.generation import RATE_LIMIT_MESSAGE
from app.api.models import (
    AssistantRequest,
    AssistantResponse,
    ChatRequest,
    ChatResponse,
    CostRequest,
    ErrorDetail,
    HealthResponse,
    RunAccepted,
    RunRequest,
    RunResult,
    RunStatus,
    SecurityRequest,
    SimulationRequest,
    UpdateRequest,
)
from app.api.runs import Clock, RunInProgress, RunRegistry
from app.eval import constants
from app.llm.client import LLMTimeoutError, RateLimitedError, TruncatedError, TransportError
from app.llm.system_prompt import SYSTEM_PROMPT_VERSION
from app.validation.rules import load_rules

ALLOWED_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
)
MAX_BODY_BYTES = 16 * 1024
MAX_UPDATE_BODY_BYTES = 512 * 1024

NO_MODEL_MESSAGE = "freeze.json has no selected_model; no fallback model is used"

_UNSET: Any = object()


def _health_defaults(freeze_path: str | Path | None) -> tuple[str, str, int]:
    """Versions and derived max time, available even with no selected model."""

    try:
        max_seconds = derive_max_run_seconds(load_freeze(freeze_path))
    except (FreezeError, KeyError, TypeError, ValueError):
        shared = constants.SHARED_SETTINGS
        max_seconds = (
            int(str(shared["MAX_ATTEMPTS"]))
            * (int(str(shared["TIMEOUT_RETRIES"])) + 1)
            * int(str(shared["TIMEOUT_S"]))
            + RUN_MARGIN_S
        )
    return SYSTEM_PROMPT_VERSION, load_rules().rules_version, max_seconds


def _error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=_error_body(code, message))


def get_client_factory(request: Request) -> Callable[[], Any]:
    """The single injectable dependency that supplies a generation client.

    Production resolves credentials lazily from the frozen model entry. Tests
    replace this dependency (or pass ``client_factory`` to ``create_app``) so
    no real client is ever constructed.
    """

    injected = getattr(request.app.state, "client_factory", None)
    if injected is not None:
        return injected

    def factory() -> Any:
        from app.llm.client import ChatClient
        from app.llm.settings import load_model_settings

        bundle: StartupBundle | None = request.app.state.bundle
        if bundle is None:
            raise RuntimeError(NO_MODEL_MESSAGE)
        settings = load_model_settings(bundle.freeze["models"][bundle.selected_model])
        return ChatClient(
            base_url=settings.base_url,
            api_key=settings.api_key,
            model=settings.model,
            timeout_s=constants.TIMEOUT_S,
        )

    return factory


def create_app(
    *,
    bundle: Any = _UNSET,
    freeze_path: str | Path | None = None,
    clock: Clock | None = None,
    client_factory: Callable[[], Any] | None = None,
) -> FastAPI:
    """Build the app. A missing/invalid selected model yields a no-model app."""

    startup_error: str | None = None
    if bundle is _UNSET:
        try:
            bundle = startup_check(freeze_path)
        except FreezeError as error:
            startup_error = str(error)
            bundle = None
    elif bundle is None:
        startup_error = NO_MODEL_MESSAGE

    selected = bundle if isinstance(bundle, StartupBundle) else None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.registry.start_watchdog()
        yield
        app.state.registry.stop_watchdog()

    app = FastAPI(title="Paladin local API", lifespan=lifespan)
    app.state.bundle = bundle
    app.state.startup_error = startup_error
    app.state.registry = RunRegistry(bundle, clock=clock)
    if selected is not None:
        app.state.health_meta = (
            selected.system_prompt_version,
            selected.rules_version,
            selected.max_run_seconds,
        )
    else:
        app.state.health_meta = _health_defaults(freeze_path)
    if client_factory is not None:
        app.state.client_factory = client_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(ALLOWED_ORIGINS),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    # Declared after CORS so this is the outermost layer: every response,
    # including CORS preflights and error responses, gets no-store.
    @app.middleware("http")
    async def _security_middleware(request: Request, call_next):
        large_body_paths = {
            "/api/updates",
            "/api/simulate",
            "/api/cost",
            "/api/security",
        }
        body_limit = (
            MAX_UPDATE_BODY_BYTES
            if request.url.path in large_body_paths
            else MAX_BODY_BYTES
        )
        declared = request.headers.get("content-length")
        oversized = declared is not None and declared.isdigit() and int(declared) > body_limit
        if not oversized:
            oversized = len(await request.body()) > body_limit
        if oversized:
            response: JSONResponse = _error_response(
                400, "invalid_request", f"request body exceeds {body_limit // 1024} KB"
            )
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        return _error_response(400, "invalid_request", "invalid request")

    @app.get("/api/health")
    def health():
        prompt_version, rules_version, max_seconds = app.state.health_meta
        if selected is None:
            return JSONResponse(
                status_code=503,
                content=HealthResponse(
                    status="unavailable",
                    model="no model selected",
                    message=NO_MODEL_MESSAGE,
                    system_prompt_version=prompt_version,
                    rules_version=rules_version,
                    max_run_seconds=max_seconds,
                ).model_dump(mode="json"),
            )
        return HealthResponse(
            status="ok",
            model=selected.selected_model,
            system_prompt_version=selected.system_prompt_version,
            rules_version=selected.rules_version,
            max_run_seconds=selected.max_run_seconds,
        )

    @app.post("/api/runs", status_code=202)
    async def create_run(
        request: Request,
        client_factory_dependency: Callable[[], Any] = Depends(get_client_factory),
    ):
        if selected is None:
            return _error_response(503, "no_model_selected", NO_MODEL_MESSAGE)
        try:
            payload = RunRequest.model_validate(json.loads(await request.body()))
        except ValueError:
            return _error_response(
                400, "invalid_request", "prompt must be a non-empty string"
            )
        try:
            snapshot = request.app.state.registry.create(
                payload.prompt, client_factory_dependency
            )
        except RunInProgress:
            return _error_response(
                409, "run_in_progress", "a run is already in progress"
            )
        return RunAccepted(
            run_id=snapshot["run_id"],
            state="running",
            started_at=snapshot["started_at"],
            max_run_seconds=snapshot["max_run_seconds"],
        )

    @app.post("/api/updates", status_code=202)
    async def update_architecture(
        request: Request,
        client_factory_dependency: Callable[[], Any] = Depends(get_client_factory),
    ):
        if selected is None:
            return _error_response(503, "no_model_selected", NO_MODEL_MESSAGE)
        try:
            payload = UpdateRequest.model_validate(json.loads(await request.body()))
        except ValueError:
            return _error_response(400, "invalid_request", "invalid architecture update request")
        architecture = payload.current_architecture.model_dump(mode="json")
        prompt = (
            "Apply the user's request as a targeted update to the existing architecture below.\n"
            "Do not redesign the system from scratch. Preserve existing component, connection, group, and requirement IDs and all unrelated design decisions.\n"
            "Only change what the user asks for. If adding or removing an element, keep every reference valid and preserve the required schema fields.\n"
            "Return the complete updated architecture object matching the supplied JSON Schema.\n\n"
            "Existing architecture JSON:\n"
            f"{json.dumps(architecture, ensure_ascii=False, separators=(',', ':'))}\n\n"
            "User request:\n"
            f"{payload.request}"
        )
        try:
            snapshot = request.app.state.registry.create(prompt, client_factory_dependency)
        except RunInProgress:
            return _error_response(409, "run_in_progress", "a run is already in progress")
        return RunAccepted(
            run_id=snapshot["run_id"],
            state="running",
            started_at=snapshot["started_at"],
            max_run_seconds=snapshot["max_run_seconds"],
        )

    @app.post("/api/chat", response_model=ChatResponse)
    def chat(
        payload: ChatRequest,
        client_factory_dependency: Callable[[], Any] = Depends(get_client_factory),
    ):
        if selected is None:
            return _error_response(503, "no_model_selected", NO_MODEL_MESSAGE)
        try:
            reply = respond_to_chat(payload, client_factory_dependency(), selected.config)
            if not reply:
                return _error_response(502, "empty_chat_reply", "The assistant returned an empty reply.")
            return ChatResponse(reply=reply)
        except RateLimitedError:
            return _error_response(429, "rate_limited", RATE_LIMIT_MESSAGE)
        except LLMTimeoutError:
            return _error_response(504, "provider_timeout", "The assistant reply timed out. Your diagram was not changed.")
        except TruncatedError:
            return _error_response(502, "truncated", "The assistant reply was cut off. Your diagram was not changed.")
        except TransportError:
            return _error_response(502, "transport_error", "The assistant could not reach the configured model. Your diagram was not changed.")
        except Exception:
            return _error_response(500, "internal_error", "The assistant could not reply. Your diagram was not changed.")

    @app.post("/api/assist", response_model=AssistantResponse)
    def assist(
        payload: AssistantRequest,
        client_factory_dependency: Callable[[], Any] = Depends(get_client_factory),
    ):
        if selected is None:
            return _error_response(503, "no_model_selected", NO_MODEL_MESSAGE)
        try:
            result = run_assistant(payload, client_factory_dependency(), selected.config)
            return result
        except RateLimitedError:
            return _error_response(429, "rate_limited", RATE_LIMIT_MESSAGE)
        except LLMTimeoutError:
            return _error_response(504, "provider_timeout", "The assistant reply timed out. Your diagram was not changed.")
        except TruncatedError:
            return _error_response(502, "truncated", "The assistant reply was cut off. Your diagram was not changed.")
        except TransportError:
            return _error_response(502, "transport_error", "The assistant could not reach the configured model. Your diagram was not changed.")
        except Exception:
            return _error_response(500, "internal_error", "The assistant could not reply. Your diagram was not changed.")

    @app.post("/api/simulate")
    async def simulate_architecture(request: Request):
        try:
            payload = SimulationRequest.model_validate(json.loads(await request.body()))
        except ValueError:
            return _error_response(400, "invalid_request", "invalid simulation request")
        return simulate(payload)

    @app.post("/api/cost")
    async def cost_analysis(request: Request):
        try:
            payload = CostRequest.model_validate(json.loads(await request.body()))
        except ValueError:
            return _error_response(400, "invalid_request", "invalid cost request")
        return analyze_cost(payload)

    @app.post("/api/security")
    async def security_analysis(request: Request):
        try:
            payload = SecurityRequest.model_validate(json.loads(await request.body()))
        except ValueError:
            return _error_response(400, "invalid_request", "invalid security request")
        return analyze_security(payload)

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, request: Request):
        if selected is None:
            return _error_response(503, "no_model_selected", NO_MODEL_MESSAGE)
        snapshot = request.app.state.registry.get(run_id)
        if snapshot is None:
            return _error_response(404, "not_found", "run not found")
        return RunStatus(
            run_id=snapshot["run_id"],
            state=snapshot["state"],
            elapsed_ms=snapshot["elapsed_ms"],
            max_run_seconds=snapshot["max_run_seconds"],
            result=RunResult.model_validate(snapshot["result"])
            if snapshot["result"] is not None
            else None,
            error=ErrorDetail.model_validate(snapshot["error"])
            if snapshot["error"] is not None
            else None,
        )

    return app
