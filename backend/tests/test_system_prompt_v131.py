"""The v1.3.1 draft is a minimal additive revision of v1.3, leak-free."""

from __future__ import annotations

import json
from pathlib import Path

from app.llm.system_prompt import load_system_prompt_version, system_prompt_sha256

REPO_ROOT = Path(__file__).resolve().parents[2]
CHANGELOG_PATH = REPO_ROOT / "prompts" / "system" / "CHANGELOG.md"
V131_SHA = "B43D4E7E2B0D55CF8CBB8BA5E55462E819982CCAE4F0DD1720F8D28EA98B3870"
V13_SHA = "A87CC5555D2BBF668FCDAB5EC112DDDFA2CC59D05AF8FA738BA5B29142E41CDB"
SHINGLE_SIZE = 8


def _normalize(text: str) -> list[str]:
    return [token.lower() for token in __import__("re").findall(r"\w+", text)]


def _shingles(text: str, size: int = SHINGLE_SIZE) -> set[tuple[str, ...]]:
    tokens = _normalize(text)
    return {tuple(tokens[i : i + size]) for i in range(max(0, len(tokens) - size + 1))}


def _eval_prompt_texts() -> list[tuple[str, str]]:
    texts: list[tuple[str, str]] = []
    eval_dir = REPO_ROOT / "eval"
    for path in sorted(eval_dir.glob("eval_set*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for prompt in payload["prompts"]:
            texts.append((prompt["id"], prompt["prompt"]))
    texts.extend(
        (p["id"], p["prompt"])
        for p in json.loads((REPO_ROOT / "scratch" / "scratch_prompts.json").read_text(encoding="utf-8"))
    )
    return texts


def find_leaks(text: str) -> list[str]:
    text_lower = text.lower()
    leaks: list[str] = []
    if 'technology~="' in text_lower:
        leaks.append("contains a technology~= predicate")
    if __import__("re").search(r"\bev[123]?_\d{2}\b", text_lower):
        leaks.append("contains an eval prompt id")
    text_shingles = _shingles(text)
    for prompt_id, prompt_text in _eval_prompt_texts():
        if prompt_text in text:
            leaks.append(f"contains the full text of {prompt_id}")
        overlap = text_shingles & _shingles(prompt_text)
        if overlap:
            leaks.append(f"shares an 8-word shingle with {prompt_id}")
    return leaks


def test_v1_3_1_registered_and_hash_frozen_in_additive_entry() -> None:
    freeze = json.loads((REPO_ROOT / "eval" / "freeze.json").read_text(encoding="utf-8"))
    text = load_system_prompt_version("1.3.1")
    block = freeze["system_prompts"]["1.3.1"]
    assert text.splitlines()[0] == "# Architecture generation — system prompt v1.3.1"
    assert system_prompt_sha256(text) == V131_SHA
    assert block["path"] == "prompts/system/architecture-v1.3.1.md"
    assert block["sha256"] == V131_SHA
    # v3 frozen pair unchanged
    assert freeze["system_prompts"]["1.3"]["sha256"] == V13_SHA
    assert freeze["eval_sets"]["3.0"]["sha256"] == "7B46B89744C7CE26BFBFF616546D7A5EDCAF1ABE29B6D4ADB876BD69ACB66141"


def test_v1_3_1_equals_v1_3_plus_exact_paragraph_and_header() -> None:
    v13 = load_system_prompt_version("1.3")
    v131 = load_system_prompt_version("1.3.1")
    reconstructed = v131.replace(
        "# Architecture generation — system prompt v1.3.1",
        "# Architecture generation — system prompt v1.3",
        1,
    )
    para = "\nEvery flag of kind underspecified must be accompanied by at least one entry in the top-level assumptions array that states the value or choice you assumed. Do not leave the assumptions array empty when you raise such a flag.\n"
    assert para in reconstructed
    reconstructed = reconstructed.replace(para, "", 1)
    assert reconstructed == v13


def test_no_eval_specific_content_from_eval_sets_or_scratch() -> None:
    assert find_leaks(load_system_prompt_version("1.3.1")) == []


def test_leak_guard_is_not_vacuous() -> None:
    base = load_system_prompt_version("1.3.1")
    assert find_leaks(base + '\nUse technology~="redis" for the cache.\n')
    assert find_leaks(base + "\nev3_01 appears here\n")
    for prompt_id, prompt_text in _eval_prompt_texts()[:3]:
        leaks = find_leaks(base + "\n" + prompt_text + "\n")
        assert leaks
        assert any(prompt_id in reason for reason in leaks)


def test_changelog_records_v131_derived_from_scratch_sc05() -> None:
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    assert "1.3.1" in changelog
    assert "sc_05" in changelog
    assert "scratch prompts are not held out" in changelog.lower() or "not held out" in changelog.lower()
    assert "disclosed late change" in changelog.lower()
