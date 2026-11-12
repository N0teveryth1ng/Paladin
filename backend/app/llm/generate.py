"""Generate one architecture, validate it, retry within a fixed budget.

Validation is strict: ``json.loads`` (no fence stripping), then the generation
JSON Schema, then ``ArchitectureDraft``. A retry message carries the validation
errors only -- never the rubric, never an expected design.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable

from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.eval import constants
from app.llm.client import LLMTimeoutError, RateLimitedError, TransportError
from app.model.architecture import ArchitectureDraft

#: The only text a retry may carry about the blocking-flag rule.
BLOCKING_FLAG_RULE_TEXT = "a blocking flag cannot be resolved by an assumption"

RESPONSE_MODES = ("json_schema", "schema_in_prompt")
MAX_ERROR_TEXT = 800


@dataclass(frozen=True)
class Attempt:
    index: int
    outcome: str
    error_kind: str | None = None
    error_text_redacted: str | None = None
    latency_ms: float | None = None
    usage: dict[str, Any] = field(default_factory=dict)
    blocking_flag_rule_only: bool = False

    def to_record(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "outcome": self.outcome,
            "error_kind": self.error_kind,
            "error_text_redacted": self.error_text_redacted,
            "latency_ms": self.latency_ms,
            "usage": dict(self.usage),
            "blocking_flag_rule_only": self.blocking_flag_rule_only,
        }


@dataclass
class GenerationResult:
    status: str
    draft: ArchitectureDraft | None
    attempts: list[Attempt]

    @property
    def first_attempt_schema_valid(self) -> bool:
        return bool(self.attempts) and self.attempts[0].outcome == "schema_valid"


@dataclass(frozen=True)
class GenerationConfig:
    temperature: float
    max_tokens: int
    timeout_s: int
    max_attempts: int
    response_mode: str
    system_prompt: str
    schema: dict[str, Any]

    def __post_init__(self) -> None:
        if self.response_mode not in RESPONSE_MODES:
            raise ValueError(f"unknown response mode: {self.response_mode!r}")


@dataclass(frozen=True)
class _Validation:
    draft: ArchitectureDraft | None
    error_kind: str | None
    error_text: str | None
    blocking_flag_rule_only: bool


def strip_leading_think_block(text: str) -> str:
    """The single documented reasoning transform: remove one leading block.

    Applied identically to every model when ``freeze.json`` records it. No other
    cleanup of model output is permitted anywhere.
    """

    stripped = text.lstrip()
    opening = "<" + "think" + ">"
    closing = "<" + "/" + "think" + ">"
    if stripped.startswith(opening):
        end = stripped.find(closing)
        if end != -1:
            return stripped[end + len(closing) :].lstrip()
    return text


REASONING_TRANSFORMS: dict[str, Callable[[str], str]] = {
    "strip_leading_think_block": strip_leading_think_block,
}


def _redact(text: str) -> str:
    flat = " ".join(text.split())
    return flat[:MAX_ERROR_TEXT]


def _validate(text: str, schema: dict[str, Any]) -> _Validation:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        return _Validation(
            None,
            "json",
            _redact(
                f"response is not valid JSON: {error.msg} at line {error.lineno} "
                f"column {error.colno}"
            ),
            False,
        )

    errors = sorted(
        Draft202012Validator(schema).iter_errors(data),
        key=lambda item: list(item.path),
    )
    if errors:
        detail = "; ".join(
            f"{'/'.join(str(part) for part in error.path) or '<root>'}: {error.message}"
            for error in errors[:10]
        )
        return _Validation(None, "schema", _redact(detail), False)

    try:
        draft = ArchitectureDraft.model_validate(data)
    except ValidationError as error:
        messages = [
            _redact(f"{'/'.join(str(part) for part in item['loc']) or '<root>'}: {item['msg']}")
            for item in error.errors()
        ]
        blocking_only = bool(messages) and all(
            BLOCKING_FLAG_RULE_TEXT in message for message in messages
        )
        return _Validation(None, "model", _redact("; ".join(messages)), blocking_only)

    return _Validation(draft, None, None, False)


def _retry_message(validation: _Validation) -> str:
    return (
        "Your previous response was rejected by validation. "
        f"Errors: {validation.error_text}. "
        "Fix exactly these problems and return only one JSON object that "
        "satisfies the schema. Do not add commentary."
    )


def build_messages(
    prompt_text: str, config: GenerationConfig
) -> list[dict[str, str]]:
    system = config.system_prompt
    if config.response_mode == "schema_in_prompt":
        schema_text = json.dumps(config.schema, indent=2, sort_keys=True)
        system = (
            f"{system}\n\n## JSON Schema\n\n"
            "The object must satisfy this schema exactly:\n\n"
            f"```json\n{schema_text}\n```\n"
        )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt_text},
    ]


def _response_format(config: GenerationConfig) -> dict[str, Any] | None:
    if config.response_mode != "json_schema":
        return None
    return {
        "type": "json_schema",
        "json_schema": {"name": "architecture", "schema": config.schema},
    }


def generate(
    client: Any,
    prompt_text: str,
    config: GenerationConfig,
    *,
    reasoning_transform: Callable[[str], str] | None = None,
) -> GenerationResult:
    """Run up to ``max_attempts`` schema attempts, plus one timeout retry."""

    messages = build_messages(prompt_text, config)
    response_format = _response_format(config)
    attempts: list[Attempt] = []
    timeouts = 0
    schema_attempts = 0
    index = 0

    while schema_attempts < config.max_attempts:
        index += 1
        try:
            completion = client.complete(
                messages,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
                response_format=response_format,
                timeout_s=config.timeout_s,
            )
        except LLMTimeoutError:
            attempts.append(Attempt(index=index, outcome="timeout", error_kind="timeout"))
            if timeouts < constants.TIMEOUT_RETRIES:
                timeouts += 1
                continue
            return GenerationResult("timeout_failed", None, attempts)
        except RateLimitedError:
            attempts.append(
                Attempt(index=index, outcome="rate_limited", error_kind="rate_limited")
            )
            return GenerationResult("rate_limited", None, attempts)
        except TransportError as error:
            attempts.append(
                Attempt(
                    index=index,
                    outcome="transport_error",
                    error_kind="transport_error",
                    error_text_redacted=_redact(str(error)),
                )
            )
            return GenerationResult("transport_error", None, attempts)

        text = completion.text
        if reasoning_transform is not None:
            text = reasoning_transform(text)

        validation = _validate(text, config.schema)
        schema_attempts += 1

        if validation.draft is not None:
            attempts.append(
                Attempt(
                    index=index,
                    outcome="schema_valid",
                    latency_ms=completion.latency_ms,
                    usage=dict(completion.usage),
                )
            )
            return GenerationResult("schema_valid", validation.draft, attempts)

        attempts.append(
            Attempt(
                index=index,
                outcome="schema_invalid",
                error_kind=validation.error_kind,
                error_text_redacted=validation.error_text,
                latency_ms=completion.latency_ms,
                usage=dict(completion.usage),
                blocking_flag_rule_only=validation.blocking_flag_rule_only,
            )
        )

        if schema_attempts < config.max_attempts:
            messages = [
                *messages,
                {"role": "assistant", "content": completion.text},
                {"role": "user", "content": _retry_message(validation)},
            ]

    return GenerationResult("schema_invalid", None, attempts)
