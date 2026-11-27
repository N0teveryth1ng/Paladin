"""Load the versioned generation system prompt."""

from __future__ import annotations

import hashlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SYSTEM_PROMPT_PATH = REPO_ROOT / "prompts" / "system" / "architecture-v1.md"
SYSTEM_PROMPT_VERSION = "1.1"

#: Held-out v1.2 draft. It is loadable by version but is not the default; the
#: active v1.1 path, version and digest above are deliberately unchanged.
SYSTEM_PROMPT_V12_PATH = REPO_ROOT / "prompts" / "system" / "architecture-v1.2.md"
SYSTEM_PROMPT_V13_PATH = REPO_ROOT / "prompts" / "system" / "architecture-v1.3.md"
SYSTEM_PROMPT_V131_PATH = REPO_ROOT / "prompts" / "system" / "architecture-v1.3.1.md"
SYSTEM_PROMPT_V132_PATH = REPO_ROOT / "prompts" / "system" / "architecture-v1.3.2.md"
SYSTEM_PROMPT_VERSIONS: dict[str, Path] = {
    "1.1": SYSTEM_PROMPT_PATH,
    "1.2": SYSTEM_PROMPT_V12_PATH,
    "1.3": SYSTEM_PROMPT_V13_PATH,
    "1.3.1": SYSTEM_PROMPT_V131_PATH,
    "1.3.2": SYSTEM_PROMPT_V132_PATH,
}


def load_system_prompt() -> str:
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def load_system_prompt_version(version: str = SYSTEM_PROMPT_VERSION) -> str:
    """Load a named prompt version. The default remains the active v1.1."""

    try:
        path = SYSTEM_PROMPT_VERSIONS[version]
    except KeyError:
        raise ValueError(f"unknown system prompt version: {version!r}") from None
    return path.read_text(encoding="utf-8")


def system_prompt_sha256(text: str | None = None) -> str:
    payload = load_system_prompt() if text is None else text
    return hashlib.sha256(payload.encode("utf-8")).hexdigest().upper()


SYSTEM_PROMPT_SHA256 = system_prompt_sha256()
