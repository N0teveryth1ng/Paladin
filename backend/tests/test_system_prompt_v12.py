"""The v1.2 draft is generic, versioned, and leak-free against both eval sets."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.llm.system_prompt import (
    SYSTEM_PROMPT_SHA256,
    SYSTEM_PROMPT_VERSION,
    load_system_prompt,
    load_system_prompt_version,
    system_prompt_sha256,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FREEZE_PATH = REPO_ROOT / "eval" / "freeze.json"
CHANGELOG_PATH = REPO_ROOT / "prompts" / "system" / "CHANGELOG.md"
SHINGLE_SIZE = 8


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _shingles(text: str) -> set[tuple[str, ...]]:
    parts = _words(text)
    return {
        tuple(parts[index : index + SHINGLE_SIZE])
        for index in range(len(parts) - SHINGLE_SIZE + 1)
    }


def _eval_prompt_texts() -> list[tuple[str, str]]:
    texts: list[tuple[str, str]] = []
    for name in ("eval_set.json", "eval_set_v2.json", "eval_set_v3.json"):
        payload = json.loads((REPO_ROOT / "eval" / name).read_text(encoding="utf-8"))
        texts.extend((entry["id"], entry["prompt"]) for entry in payload["prompts"])
    scratch = json.loads((REPO_ROOT / "scratch" / "scratch_prompts.json").read_text(encoding="utf-8"))
    texts.extend((entry["id"], entry["prompt"]) for entry in scratch)
    return texts


def find_leaks(text: str) -> list[str]:
    leaks: list[str] = []
    if "technology~=" in text:
        leaks.append("contains a technology~= predicate")
    if re.search(r"\bev_\d{2}\b|\bev2_\d{2}\b|\bev3_\d{2}\b", text):
        leaks.append("contains an eval prompt id")
    text_shingles = _shingles(text)
    for prompt_id, prompt_text in _eval_prompt_texts():
        if prompt_text in text:
            leaks.append(f"contains the full text of {prompt_id}")
        if text_shingles & _shingles(prompt_text):
            leaks.append(f"shares an 8-word shingle with {prompt_id}")
    return leaks


def test_default_prompt_is_still_v1_1() -> None:
    assert SYSTEM_PROMPT_VERSION == "1.1"
    assert system_prompt_sha256(load_system_prompt()) == SYSTEM_PROMPT_SHA256


def test_v1_2_loads_by_version_and_matches_the_frozen_digest() -> None:
    freeze = json.loads(FREEZE_PATH.read_text(encoding="utf-8"))
    text = load_system_prompt_version("1.2")
    block = freeze["system_prompts"]["1.2"]

    assert text.splitlines()[0] == "# Architecture generation — system prompt v1.2"
    assert system_prompt_sha256(text) == block["sha256"]
    assert block["path"] == "prompts/system/architecture-v1.2.md"
    assert freeze["system_prompt_sha256"] == SYSTEM_PROMPT_SHA256


def test_approved_amendments_are_present_verbatim() -> None:
    text = " ".join(load_system_prompt_version("1.2").split())

    assert "## Minimal, justified structure" in text
    assert (
        "A requirement may be functional or non-functional, including stated "
        "needs for scale, availability, latency, durability and security"
    ) in text
    assert (
        "An assumption about an unstated quantity or definition — such as the "
        "number of users, the budget, or the meaning of a vague term — remains "
        "allowed and must be stated as an assumption"
    ) in text
    assert "The restriction in this section applies only to adding" in text
    assert "`client` is an endpoint that a human or an external system uses" in text
    assert "`service` is an owned backend component that accepts requests" in text
    assert "A clean prompt must not produce a blocking flag. Whenever two or more" in text
    assert "A flag never replaces the design: always deliver the full architecture" in text
    assert "good architecture" not in text.lower()
    assert "common practice" not in text.lower()


def test_changelog_records_scored_v1_0_evidence_and_held_out_status() -> None:
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    start = changelog.index("## Proposed v1.2")
    entry = changelog[start:]

    assert "Derived from: the **scored v1.0 run**" in entry
    assert "ev_08 x02/x03" in entry
    assert "v1.0 is no longer held-out for v1.2" in entry
    assert "eval/eval_set_v2.json" in entry


def test_no_eval_specific_content_from_either_set() -> None:
    assert find_leaks(load_system_prompt_version("1.2")) == []


def test_leak_guard_is_not_vacuous_for_both_sets() -> None:
    base = load_system_prompt_version("1.2")
    planted = base + '\nUse technology~="redis" for the cache.\n'
    assert find_leaks(planted)

    for prompt_id, prompt_text in (_eval_prompt_texts()[0], _eval_prompt_texts()[-1]):
        assert find_leaks(base + "\n" + prompt_text + "\n")
        assert any(prompt_id in reason for reason in find_leaks(base + "\n" + prompt_text + "\n"))
