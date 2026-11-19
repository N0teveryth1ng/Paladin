"""The client reads only ``message.content`` and classifies truncation."""

from __future__ import annotations

import pytest

from app.eval import constants
from app.llm.client import ChatClient, TransportError, TruncatedError


def client_with(response: dict) -> ChatClient:
    client = ChatClient(
        base_url="https://stub.test/v1",
        api_key="test-key",
        model="test-model",
        timeout_s=10,
    )

    def fake_request(path, *, payload, timeout_s):
        return response, 12.5

    client._request = fake_request  # type: ignore[method-assign]
    return client


def test_null_content_at_the_token_cap_is_a_truncation() -> None:
    client = client_with(
        {
            "choices": [
                {
                    "message": {"content": None, "reasoning": "thinking..."},
                    "finish_reason": "length",
                }
            ],
            "usage": {"completion_tokens": 4096, "reasoning_tokens": 4096},
        }
    )

    with pytest.raises(TruncatedError) as error:
        client.complete([{"role": "user", "content": "hi"}], temperature=0.3, max_tokens=4096)

    assert error.value.finish_reason == "length"
    assert error.value.usage["completion_tokens"] == 4096
    assert error.value.latency_ms == pytest.approx(12.5)


def test_null_content_without_a_cap_is_a_transport_error() -> None:
    client = client_with(
        {
            "choices": [
                {"message": {"content": None}, "finish_reason": "stop"},
            ]
        }
    )

    with pytest.raises(TransportError):
        client.complete([{"role": "user", "content": "hi"}], temperature=0.3, max_tokens=4096)


def test_default_timeout_matches_the_shared_setting() -> None:
    client = ChatClient(base_url="https://stub.test/v1", api_key="k", model="m")

    assert client.timeout_s == constants.TIMEOUT_S


def test_reasoning_object_is_sent_only_when_provided() -> None:
    client = ChatClient(
        base_url="https://stub.test/v1", api_key="k", model="m", timeout_s=10
    )
    payloads: list[dict] = []

    def fake_request(path, *, payload, timeout_s):
        payloads.append(payload)
        return (
            {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]},
            1.0,
        )

    client._request = fake_request  # type: ignore[method-assign]

    client.complete(
        [{"role": "user", "content": "hi"}],
        temperature=0.3,
        max_tokens=10,
        reasoning={"enabled": False},
    )
    client.complete(
        [{"role": "user", "content": "hi"}], temperature=0.3, max_tokens=10
    )

    assert payloads[0]["reasoning"] == {"enabled": False}
    assert "reasoning" not in payloads[1]
