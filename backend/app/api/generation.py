"""Generation followed by report-only validation.

Generation is delegated to the one harness function; validator issues are
attached to the result and are never fed back into generation or retry text.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.api.models import IssueResponse, RunResult
from app.llm.generate import MAX_ERROR_TEXT, GenerationConfig, GenerationResult, generate
from app.validation.rules import load_rules
from app.validation.validators import validate_graph

RATE_LIMIT_MESSAGE = (
    "Free-model daily limit reached (HTTP 429). No retry was made. "
    "Try again after the daily reset at 00:00 UTC."
)
PROVIDER_TIMEOUT_MESSAGE = (
    "The provider request timed out. No retry remains. No diagram was changed."
)
TRUNCATED_MESSAGE = (
    "The provider response was truncated at the token cap. No diagram was changed."
)
TRANSPORT_MESSAGE = "The provider connection failed. No diagram was changed."
SCHEMA_INVALID_MESSAGE = (
    "The model response did not match the required schema. No diagram was changed."
)
INTERNAL_MESSAGE = "Generation failed. No diagram was changed."


@dataclass(frozen=True)
class GenerationOutcome:
    status: str
    result: RunResult | None = None
    error: dict[str, str] | None = None


def _last_validation_text(result: GenerationResult) -> str | None:
    """The last redacted validation text, capped at the harness limit."""

    for attempt in reversed(result.attempts):
        text = attempt.error_text_redacted
        if text:
            return " ".join(text.split())[:MAX_ERROR_TEXT]
    return None


def _failure(result: GenerationResult) -> tuple[str, str]:
    if result.status == "rate_limited":
        return "rate_limited", RATE_LIMIT_MESSAGE
    if result.status == "timeout_failed":
        return "provider_timeout", PROVIDER_TIMEOUT_MESSAGE
    if result.status == "truncated":
        return "truncated", TRUNCATED_MESSAGE
    if result.status == "transport_error":
        return "transport_error", TRANSPORT_MESSAGE
    if result.status == "schema_invalid":
        return "schema_invalid", _last_validation_text(result) or SCHEMA_INVALID_MESSAGE
    return "internal_error", INTERNAL_MESSAGE


def generate_and_validate(
    *,
    prompt: str,
    config: GenerationConfig,
    reasoning_transform: Any,
    client: Any,
) -> GenerationOutcome:
    """Call ``generate`` once, then validate a schema-valid draft exactly once."""

    result = generate(
        client,
        prompt,
        config,
        reasoning_transform=reasoning_transform,
    )

    if result.status == "schema_valid" and result.draft is not None:
        rules = load_rules()
        issues = validate_graph(result.draft, rules)
        payload = RunResult(
            draft=result.draft.model_dump(mode="json"),
            issues=[
                IssueResponse(**issue.model_dump(mode="json")) for issue in issues
            ],
            rules_version=rules.rules_version,
        )
        return GenerationOutcome(status="succeeded", result=payload)

    code, message = _failure(result)
    return GenerationOutcome(status="failed", error={"code": code, "message": message})
