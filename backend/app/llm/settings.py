"""Configuration for the OpenAI-compatible provider.

Keys come from the environment, falling back to a git-ignored ``.env``. The key
is redacted by ``repr``, ``str`` and ``to_record`` so it cannot leak into a log
line or a run record.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

REPO_ROOT = Path(__file__).resolve().parents[3]
DOTENV_PATH = REPO_ROOT / ".env"

BASE_URL_VAR = "LLM_BASE_URL"
API_KEY_VAR = "LLM_API_KEY"
MODEL_VAR = "LLM_MODEL"

REDACTED = "***"


class SettingsError(RuntimeError):
    """Raised when a required setting is absent. Names the variable only."""


@dataclass(frozen=True, repr=False)
class Settings:
    base_url: str
    api_key: str = field(repr=False)
    model: str

    def __repr__(self) -> str:
        return (
            f"Settings(base_url={self.base_url!r}, api_key={REDACTED!r}, "
            f"model={self.model!r})"
        )

    def __str__(self) -> str:
        return self.__repr__()

    def to_record(self) -> dict[str, str]:
        """The settings as they may be written to disk. Never the key."""

        return {
            "base_url": self.base_url,
            "api_key": REDACTED,
            "model": self.model,
        }


def read_dotenv(path: Path) -> dict[str, str]:
    """Parse ``KEY=VALUE`` lines. No interpolation, no expansion."""

    values: dict[str, str] = {}
    if not path.is_file():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if name:
            values[name] = value
    return values


def load_settings(
    env: Mapping[str, str] | None = None,
    dotenv_path: Path | None = None,
) -> Settings:
    """Load the three settings. The environment wins over ``.env``."""

    environment = os.environ if env is None else env
    dotenv = read_dotenv(DOTENV_PATH if dotenv_path is None else dotenv_path)

    def get(name: str) -> str:
        value = environment.get(name)
        if value is None or value == "":
            value = dotenv.get(name)
        if value is None or value == "":
            raise SettingsError(f"missing required setting: {name}")
        return value

    return Settings(
        base_url=get(BASE_URL_VAR),
        api_key=get(API_KEY_VAR),
        model=get(MODEL_VAR),
    )
