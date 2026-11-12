"""Load the versioned generation system prompt."""

from __future__ import annotations

import hashlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SYSTEM_PROMPT_PATH = REPO_ROOT / "prompts" / "system" / "architecture-v1.md"
SYSTEM_PROMPT_VERSION = "1.0"


def load_system_prompt() -> str:
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def system_prompt_sha256(text: str | None = None) -> str:
    payload = load_system_prompt() if text is None else text
    return hashlib.sha256(payload.encode("utf-8")).hexdigest().upper()


SYSTEM_PROMPT_SHA256 = system_prompt_sha256()
