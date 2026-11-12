"""The system prompt is generic, versioned and free of eval-specific content."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.llm.system_prompt import (
    SYSTEM_PROMPT_SHA256,
    SYSTEM_PROMPT_VERSION,
    load_system_prompt,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_SET_PATH = REPO_ROOT / "eval" / "eval_set.json"
SHINGLE_SIZE = 8


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _shingles(text: str, size: int = SHINGLE_SIZE) -> set[tuple[str, ...]]:
    words = _words(text)
    return {tuple(words[index : index + size]) for index in range(len(words) - size + 1)}


def _eval_prompts() -> list[dict]:
    return json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))["prompts"]


def find_leaks(text: str) -> list[str]:
    """Return every reason the text is not allowed to be a system prompt."""

    leaks: list[str] = []
    prompts = _eval_prompts()

    if "technology~=" in text:
        leaks.append("contains a technology~= predicate")

    if re.search(r"\bev_\d{2}\b", text):
        leaks.append("contains an eval prompt id")

    text_shingles = _shingles(text)
    for prompt in prompts:
        if prompt["prompt"] in text:
            leaks.append(f"contains the full text of {prompt['id']}")
        overlap = text_shingles & _shingles(prompt["prompt"])
        if overlap:
            leaks.append(f"shares an 8-word shingle with {prompt['id']}")

    return leaks


def test_loads_and_is_versioned() -> None:
    text = load_system_prompt()
    assert text.strip()
    assert SYSTEM_PROMPT_VERSION == "1.0"
    assert re.fullmatch(r"[0-9A-F]{64}", SYSTEM_PROMPT_SHA256)


def test_connection_definitions_are_verbatim() -> None:
    text = " ".join(load_system_prompt().split())
    assert (
        "`sync` - the caller waits for the receiver to respond before continuing."
        in text
    )
    assert (
        "`async` - the caller does not wait for the receiver to process the work; "
        "handing work to a queue or event stream is `async`."
    ) in text


def test_narrow_severity_rules_are_present() -> None:
    text = " ".join(load_system_prompt().split()).lower()
    assert "severity: blocking" in text
    assert "cannot all be satisfied together" in text
    assert "one of them is impossible" in text
    assert "resolved_by" in text
    assert "severity: warning" in text
    assert "a requirement is vague" in text
    assert "an assumption was needed" in text
    assert "a clean prompt must not produce a blocking flag" in text
    for kind in ("contradiction", "underspecified", "unverifiable"):
        assert kind in text


def test_technology_rule_is_present() -> None:
    text = " ".join(load_system_prompt().split())
    assert "real, existing product that fits the component type" in text
    assert "`null`" in text


def test_no_eval_specific_content() -> None:
    assert find_leaks(load_system_prompt()) == []


def test_leak_guard_is_not_vacuous() -> None:
    planted = load_system_prompt() + '\nUse technology~="redis" for the cache.\n'
    assert find_leaks(planted)

    planted_id = load_system_prompt() + "\nThis is the design for ev_01.\n"
    assert find_leaks(planted_id)

    eval_text = _eval_prompts()[0]["prompt"]
    planted_prompt = load_system_prompt() + "\n" + eval_text + "\n"
    assert find_leaks(planted_prompt)
