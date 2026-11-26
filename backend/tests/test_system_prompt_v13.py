"""The v1.3 draft is generic, versioned, and leak-free against eval sets and scratch."""

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


def test_v1_3_loads_by_version_and_matches_the_frozen_digest() -> None:
    freeze = json.loads(FREEZE_PATH.read_text(encoding="utf-8"))
    text = load_system_prompt_version("1.3")
    block = freeze["system_prompts"]["1.3"]

    assert text.splitlines()[0] == "# Architecture generation — system prompt v1.3"
    assert system_prompt_sha256(text) == block["sha256"]
    assert block["path"] == "prompts/system/architecture-v1.3.md"
    assert freeze["system_prompt_sha256"] == SYSTEM_PROMPT_SHA256


def test_approved_amendments_are_present() -> None:
    text = " ".join(load_system_prompt_version("1.3").split())

    assert "## Minimal, justified structure" in text
    assert "Do not omit a component that a stated requirement makes necessary." in text
    assert (
        "For unstated quantities and vague prompts, follow the assumption-placement "
        "and justification rule in `## Assumptions and traceability`."
    ) in text
    assert "## Assumptions and traceability" in text
    assert (
        "Assumptions about unstated quantities, definitions, or choices must be "
        "recorded as entries in the top-level `assumptions` array, not only in "
        "flags or rationales."
    ) in text
    assert (
        "When a prompt is vague, state the assumed quantity, such as scale, users, "
        "or budget, as an assumption entry, and justify any scalability component "
        "against that stated assumption."
    ) in text
    assert (
        "Do not add generic scalability or modernity components that no stated "
        "requirement or stated assumption needs."
    ) in text
    assert "good architecture" not in text.lower()


def test_changelog_records_scored_v2_evidence_and_held_out_status() -> None:
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    start = changelog.index("## Proposed v1.3")
    next_heading = changelog.find("\n## Proposed v1.2")
    entry = changelog[start:next_heading] if next_heading != -1 else changelog[start:]

    assert "Derived from: **scored v2 failures**" in entry
    assert "ev2_14" in entry
    assert "r01" in entry and "r03" in entry
    assert "v1.0 and v2.0 remain historical scored sets" in entry
    assert "held-out v3.0" in entry
    assert "Scratch evidence: pending" in entry


def test_no_eval_specific_content_from_eval_sets_or_scratch() -> None:
    assert find_leaks(load_system_prompt_version("1.3")) == []


def test_leak_guard_is_not_vacuous() -> None:
    base = load_system_prompt_version("1.3")
    assert find_leaks(base + '\nUse technology~="redis" for the cache.\n')
    assert find_leaks(base + "\nev3_01 appears here\n")
    for prompt_id, prompt_text in _eval_prompt_texts()[:3]:
        leaks = find_leaks(base + "\n" + prompt_text + "\n")
        assert leaks
        assert any(prompt_id in reason for reason in leaks)


def test_v1_3_is_v1_2_plus_only_approved_insertions() -> None:
    v12 = (REPO_ROOT / "prompts" / "system" / "architecture-v1.2.md").read_text(encoding="utf-8")
    v13 = load_system_prompt_version("1.3")

    reconstructed = v13.replace(
        "# Architecture generation — system prompt v1.3",
        "# Architecture generation — system prompt v1.2",
        1,
    )
    cross = "\nFor unstated quantities and vague prompts, follow the assumption-placement and justification rule in `## Assumptions and traceability`.\n"
    assump = "\nAssumptions about unstated quantities, definitions, or choices must be recorded as entries in the top-level `assumptions` array, not only in flags or rationales. When a prompt is vague, state the assumed quantity, such as scale, users, or budget, as an assumption entry, and justify any scalability component against that stated assumption. Do not add generic scalability or modernity components that no stated requirement or stated assumption needs.\n"
    assert cross in reconstructed
    assert assump in reconstructed
    reconstructed = reconstructed.replace(cross, "", 1)
    reconstructed = reconstructed.replace(assump, "", 1)
    assert reconstructed == v12


def test_v1_3_contains_section_12_1_connection_definitions_verbatim() -> None:
    v13 = load_system_prompt_version("1.3")
    assert "Give every connection exactly one of these two types:" in v13
    assert "- `sync` — the caller waits for the receiver to respond before continuing." in v13
    assert "- `async` — the caller does not wait for the receiver to process the work; handing work to a" in v13
    assert "  queue or event stream is `async`." in v13
    assert "Do not invent a third type." in v13
