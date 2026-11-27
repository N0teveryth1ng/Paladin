from __future__ import annotations

import json
from pathlib import Path

from app.llm.system_prompt import (
    SYSTEM_PROMPT_VERSION,
    load_system_prompt_version,
    system_prompt_sha256,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
V132_SHA = "DEA702353DDC4D8A74D381F077F2F7998F76897013D5C01E9BF98C78B2E49616"
V131_SHA = "B43D4E7E2B0D55CF8CBB8BA5E55462E819982CCAE4F0DD1720F8D28EA98B3870"


def test_v1_3_2_candidate_is_registered_without_changing_active_prompt() -> None:
    freeze = json.loads((REPO_ROOT / "eval" / "freeze.json").read_text(encoding="utf-8"))
    prompt = load_system_prompt_version("1.3.2")
    entry = freeze["system_prompts"]["1.3.2"]

    assert prompt.splitlines()[0] == "# Architecture generation — system prompt v1.3.2"
    assert system_prompt_sha256(prompt) == V132_SHA
    assert entry == {
        "path": "prompts/system/architecture-v1.3.2.md",
        "sha256": V132_SHA,
    }
    assert freeze["system_prompts"]["1.3.1"]["sha256"] == V131_SHA
    assert SYSTEM_PROMPT_VERSION == "1.1"


def test_v1_3_2_adds_only_generic_diagram_readability_rules() -> None:
    prompt = load_system_prompt_version("1.3.2")
    assert "## Diagram readability" in prompt
    assert "brief action label of a few words" in prompt
    assert "Do not repeat the" in prompt
    assert "technology`, not in the connection label" in prompt
