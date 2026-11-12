"""The scratch set is separate from the eval set and never scored."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.eval.runner import run_scored

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRATCH_PATH = REPO_ROOT / "scratch" / "scratch_prompts.json"
EVAL_SET_PATH = REPO_ROOT / "eval" / "eval_set.json"
SHINGLE_SIZE = 8

EVAL_DOMAIN_TERMS = (
    "marketing website",
    "contact form",
    "url shortener",
    "short code",
    "transactional email",
    "email provider",
    "admin tool",
    "e-commerce",
    "checkout",
    "order pipeline",
    "search index",
    "multi-tenant",
    "per-tenant",
    "video",
    "transcod",
    "ride-hailing",
    "dispatch",
    "payment ledger",
    "exactly-once",
    "concurrent connections",
    "single region",
    "strong consistency",
)


def scratch() -> list[dict]:
    return json.loads(SCRATCH_PATH.read_text(encoding="utf-8"))


def eval_prompts() -> list[dict]:
    return json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))["prompts"]


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def shingles(text: str) -> set[tuple[str, ...]]:
    tokens = words(text)
    return {
        tuple(tokens[index : index + SHINGLE_SIZE])
        for index in range(len(tokens) - SHINGLE_SIZE + 1)
    }


def test_exactly_five_prompts_with_unique_ids() -> None:
    prompts = scratch()
    assert len(prompts) == 5
    ids = [prompt["id"] for prompt in prompts]
    assert len(set(ids)) == len(ids)
    assert all(prompt["prompt"].strip() for prompt in prompts)


def test_has_a_contradictory_and_a_vague_prompt() -> None:
    kinds = {prompt["kind"] for prompt in scratch()}
    assert "contradictory" in kinds
    assert "vague" in kinds


def test_no_eight_word_shingle_is_shared_with_an_eval_prompt() -> None:
    for prompt in scratch():
        shared = shingles(prompt["prompt"])
        for eval_prompt in eval_prompts():
            overlap = shared & shingles(eval_prompt["prompt"])
            assert not overlap, f"{prompt['id']} shares a shingle with {eval_prompt['id']}"


def test_no_eval_domain_term_appears() -> None:
    for prompt in scratch():
        text = " ".join(prompt.values()).lower()
        for term in EVAL_DOMAIN_TERMS:
            assert term not in text, f"{prompt['id']} mentions {term!r}"


def test_no_scratch_id_is_an_eval_id() -> None:
    eval_ids = {prompt["id"] for prompt in eval_prompts()}
    assert not ({prompt["id"] for prompt in scratch()} & eval_ids)


def test_scored_runner_never_reads_the_scratch_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    opened: list[str] = []
    real_open = Path.open

    def spy(self, *args, **kwargs):
        opened.append(str(self))
        return real_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", spy)

    from app.eval import constants
    from app.llm.client import Completion
    from app.llm.system_prompt import SYSTEM_PROMPT_SHA256, SYSTEM_PROMPT_VERSION
    from app.eval.runner import sha256_file

    class StubClient:
        base_url = "https://stub.test/v1"

        def complete(self, messages, **kwargs):
            return Completion(
                text=(
                    REPO_ROOT
                    / "backend"
                    / "tests"
                    / "fixtures"
                    / "fake_llm"
                    / "valid_response.json"
                ).read_text(encoding="utf-8"),
                usage={},
                latency_ms=1.0,
            )

    freeze = {
        "eval_set_sha256": sha256_file(EVAL_SET_PATH),
        "system_prompt_version": SYSTEM_PROMPT_VERSION,
        "system_prompt_sha256": SYSTEM_PROMPT_SHA256,
        "thresholds": constants.THRESHOLDS,
        "shared_settings": constants.SHARED_SETTINGS,
        "max_tokens": 1000,
        "max_tokens_measurements": [{"output_tokens": 400}],
        "reasoning_transform": None,
        "models": {
            "test-model": {
                "model_id": "test-model",
                "response_mode": "json_schema",
                "notes": "",
            }
        },
        "scored_run_approved": True,
    }
    freeze_path = tmp_path / "freeze.json"
    freeze_path.write_text(json.dumps(freeze), encoding="utf-8")

    run_scored(
        model="test-model",
        client=StubClient(),
        out_dir=tmp_path / "runs",
        freeze_path=freeze_path,
        eval_set_path=EVAL_SET_PATH,
        schema_path=REPO_ROOT / "schema" / "architecture.generation.schema.json",
        only_prompt="ev_01",
        sleep=lambda seconds: None,
    )

    assert not [path for path in opened if "scratch" in path.lower()]
