"""Generation validates strictly, retries within budget and classifies failures."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.llm.client import (
    Completion,
    LLMTimeoutError,
    RateLimitedError,
    TransportError,
)
from app.llm.generate import (
    BLOCKING_FLAG_RULE_TEXT,
    GenerationConfig,
    build_messages,
    generate,
)
from app.llm.system_prompt import load_system_prompt

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads(
    (REPO_ROOT / "schema" / "architecture.generation.schema.json").read_text(
        encoding="utf-8"
    )
)
VALID = (REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "valid_response.json").read_text(
    encoding="utf-8"
)
FLAGGED = (REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "flagged_response.json").read_text(
    encoding="utf-8"
)
INVALID_JSON = (
    REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_llm" / "invalid_json.txt"
).read_text(encoding="utf-8")


class StubClient:
    base_url = "https://stub.test/v1"

    def __init__(self, responses: list[Any]):
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def complete(self, messages, **kwargs):
        self.calls.append({"messages": messages, **kwargs})
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        if isinstance(item, str):
            return Completion(
                text=item,
                usage={"completion_tokens": 42, "prompt_tokens": 7},
                latency_ms=12.5,
                finish_reason="stop",
            )
        return item


def config(mode: str = "json_schema") -> GenerationConfig:
    return GenerationConfig(
        temperature=0.3,
        max_tokens=8000,
        timeout_s=120,
        max_attempts=3,
        response_mode=mode,
        system_prompt=load_system_prompt(),
        schema=SCHEMA,
    )


def test_valid_first_response() -> None:
    client = StubClient([VALID])
    result = generate(client, "Design something.", config())

    assert result.status == "schema_valid"
    assert result.draft is not None
    assert len(result.attempts) == 1
    assert result.first_attempt_schema_valid


def test_invalid_then_valid_uses_attempt_two() -> None:
    client = StubClient([INVALID_JSON, VALID])
    result = generate(client, "Design something.", config())

    assert result.status == "schema_valid"
    assert [attempt.outcome for attempt in result.attempts] == [
        "schema_invalid",
        "schema_valid",
    ]
    assert not result.first_attempt_schema_valid


def test_three_invalid_responses_fail_the_run() -> None:
    client = StubClient([INVALID_JSON, INVALID_JSON, INVALID_JSON])
    result = generate(client, "Design something.", config())

    assert result.status == "schema_invalid"
    assert len(result.attempts) == 3
    assert not result.first_attempt_schema_valid


def test_blocking_flag_rule_only_is_classified_and_retried() -> None:
    payload = copy.deepcopy(json.loads(FLAGGED))
    payload["flags"][0]["severity"] = "blocking"
    payload["flags"][0]["resolved_by"] = "asm_no_expiry"

    client = StubClient([json.dumps(payload), VALID])
    result = generate(client, "Design something.", config())

    assert result.status == "schema_valid"
    assert len(result.attempts) == 2
    assert result.attempts[0].blocking_flag_rule_only
    assert BLOCKING_FLAG_RULE_TEXT in (result.attempts[0].error_text_redacted or "")


def test_rate_limit_is_infrastructure_not_schema_failure() -> None:
    client = StubClient([RateLimitedError("429")])
    result = generate(client, "Design something.", config())

    assert result.status == "rate_limited"
    assert result.attempts[0].outcome == "rate_limited"
    assert result.draft is None


def test_transport_error_is_infrastructure() -> None:
    client = StubClient([TransportError("connection reset")])
    result = generate(client, "Design something.", config())

    assert result.status == "transport_error"
    assert result.attempts[0].error_kind == "transport_error"


def test_one_timeout_is_retried_without_consuming_a_schema_attempt() -> None:
    client = StubClient([LLMTimeoutError("timed out"), VALID])
    result = generate(client, "Design something.", config())

    assert result.status == "schema_valid"
    assert [attempt.outcome for attempt in result.attempts] == ["timeout", "schema_valid"]
    assert not result.first_attempt_schema_valid


def test_two_timeouts_end_the_run_as_timeout_failed() -> None:
    client = StubClient([LLMTimeoutError("timed out"), LLMTimeoutError("timed out")])
    result = generate(client, "Design something.", config())

    assert result.status == "timeout_failed"
    assert len(result.attempts) == 2
    assert not result.first_attempt_schema_valid


def test_retry_carries_errors_not_design_content() -> None:
    client = StubClient([INVALID_JSON, VALID])
    generate(client, "Design something.", config())

    retry_messages = client.calls[1]["messages"]
    last_user = retry_messages[-1]["content"]
    assert "rejected by validation" in last_user
    assert "JSON" in last_user or "required" in last_user
    for design_token in ("PostgreSQL", "Shortener Service", "Redis", "Kong"):
        assert design_token not in last_user


def test_usage_and_latency_are_recorded() -> None:
    client = StubClient([VALID])
    result = generate(client, "Design something.", config())

    attempt = result.attempts[0]
    assert attempt.usage["completion_tokens"] == 42
    assert attempt.latency_ms == pytest.approx(12.5)


def test_schema_in_prompt_mode_puts_the_schema_in_the_system_message() -> None:
    client = StubClient([VALID])
    result = generate(client, "Design something.", config("schema_in_prompt"))

    assert result.status == "schema_valid"
    assert client.calls[0]["response_format"] is None
    system = client.calls[0]["messages"][0]["content"]
    assert "JSON Schema" in system
    assert '"$defs"' in system


def test_json_schema_mode_requests_structured_output() -> None:
    client = StubClient([VALID])
    generate(client, "Design something.", config("json_schema"))

    response_format = client.calls[0]["response_format"]
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["schema"] == SCHEMA


def test_build_messages_starts_with_system_and_user() -> None:
    messages = build_messages("Design something.", config())
    assert [message["role"] for message in messages] == ["system", "user"]
    assert messages[1]["content"] == "Design something."
