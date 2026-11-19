"""Freeze-driven configuration shared by the scored harness and the local API.

There is one source of truth for generation settings: ``eval/freeze.json`` plus
the frozen system prompt and schema. Nothing in this module chooses a model by
default: a missing or unknown ``selected_model`` is always a startup error.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.llm.generate import REASONING_TRANSFORMS, GenerationConfig
from app.llm.system_prompt import (
    SYSTEM_PROMPT_VERSION,
    load_system_prompt,
    system_prompt_sha256,
)
from app.validation.rules import load_rules

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FREEZE = REPO_ROOT / "eval" / "freeze.json"
DEFAULT_SCHEMA = REPO_ROOT / "schema" / "architecture.generation.schema.json"

#: Named, fixed margin covering validation, layout, watchdog and polling
#: overhead. It is stated here rather than hardcoded at any call site.
RUN_MARGIN_S = 60


class FreezeError(RuntimeError):
    """A freeze or system-prompt problem that blocks startup. No key material."""


def load_freeze(path: str | Path | None = None) -> dict[str, Any]:
    """Read ``freeze.json`` from *path* (default: the committed freeze)."""

    freeze_path = Path(path) if path is not None else DEFAULT_FREEZE
    try:
        payload = json.loads(freeze_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FreezeError(f"freeze.json: cannot read freeze file: {error}") from None
    if not isinstance(payload, dict):
        raise FreezeError("freeze.json: top level must be an object")
    return payload


def selected_model_name(freeze: dict[str, Any]) -> str:
    """Return the single selected model, or raise. Never fall back."""

    name = freeze.get("selected_model")
    if not isinstance(name, str) or not name.strip():
        raise FreezeError(
            "freeze.json has no selected_model; no fallback model is used"
        )
    models = freeze.get("models")
    if not isinstance(models, dict) or name not in models:
        raise FreezeError(
            f"freeze.json selected_model {name!r} is not in models; "
            "no fallback model is used"
        )
    return name


def verify_system_prompt_hash(freeze: dict[str, Any]) -> str:
    """Require the loaded system prompt's digest to equal the frozen one."""

    expected = freeze.get("system_prompt_sha256")
    actual = system_prompt_sha256(load_system_prompt())
    if expected != actual:
        raise FreezeError(
            "freeze.json system_prompt_sha256 mismatch: "
            f"freeze={expected} actual={actual}"
        )
    return actual


def build_generation_config(
    freeze: dict[str, Any],
    model_entry: dict[str, Any],
    system_prompt: str,
    schema: dict[str, Any],
) -> GenerationConfig:
    """The one builder used by both the harness runner and the API endpoint.

    Field-for-field identical to the runner's former inline construction.
    """

    shared = freeze["shared_settings"]
    return GenerationConfig(
        temperature=shared["TEMPERATURE"],
        max_tokens=freeze["max_tokens"],
        timeout_s=shared["TIMEOUT_S"],
        max_attempts=shared["MAX_ATTEMPTS"],
        response_mode=model_entry["response_mode"],
        system_prompt=system_prompt,
        schema=schema,
        reasoning=model_entry.get("reasoning"),
    )


def resolve_reasoning_transform(
    freeze: dict[str, Any],
) -> Callable[[str], str] | None:
    """Resolve the single documented transform named by the freeze."""

    name = freeze.get("reasoning_transform")
    if name is None:
        return None
    try:
        return REASONING_TRANSFORMS[name]
    except KeyError:
        raise FreezeError(
            f"freeze.json unknown reasoning_transform: {name!r}"
        ) from None


def derive_max_run_seconds(freeze: dict[str, Any]) -> int:
    """MAX_ATTEMPTS x (TIMEOUT_RETRIES + 1) x TIMEOUT_S + RUN_MARGIN_S."""

    shared = freeze["shared_settings"]
    return (
        int(shared["MAX_ATTEMPTS"])
        * (int(shared["TIMEOUT_RETRIES"]) + 1)
        * int(shared["TIMEOUT_S"])
        + RUN_MARGIN_S
    )


@dataclass(frozen=True)
class StartupBundle:
    """The immutable result of a successful startup check."""

    freeze: dict[str, Any]
    selected_model: str
    config: GenerationConfig
    reasoning_transform: Callable[[str], str] | None
    max_run_seconds: int
    system_prompt_version: str
    rules_version: str


def startup_check(
    freeze_path: str | Path | None = None,
    schema_path: str | Path | None = None,
) -> StartupBundle:
    """Validate all frozen inputs and return the shared configuration bundle.

    This never loads provider credentials. Credentials are resolved lazily by
    the production client factory, so the app remains constructible in tests
    with no key present and with an injected client.
    """

    freeze = load_freeze(freeze_path)
    selected = selected_model_name(freeze)
    verify_system_prompt_hash(freeze)

    model_entry = freeze["models"][selected]
    schema_file = Path(schema_path) if schema_path is not None else DEFAULT_SCHEMA
    try:
        schema = json.loads(schema_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FreezeError(f"generation schema: cannot read schema file: {error}") from None

    system_prompt = load_system_prompt()
    return StartupBundle(
        freeze=freeze,
        selected_model=selected,
        config=build_generation_config(freeze, model_entry, system_prompt, schema),
        reasoning_transform=resolve_reasoning_transform(freeze),
        max_run_seconds=derive_max_run_seconds(freeze),
        system_prompt_version=SYSTEM_PROMPT_VERSION,
        rules_version=load_rules().rules_version,
    )
