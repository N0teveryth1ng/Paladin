"""Scratch runs only. This module cannot see ``eval/eval_set.json``.

Scratch runs choose the response mode, ``max_tokens`` and system-prompt wording.
They are never scored and never counted.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.eval import constants
from app.llm.client import ChatClient
from app.llm.generate import RESPONSE_MODES, GenerationConfig, generate
from app.llm.settings import SettingsError, load_settings
from app.llm.system_prompt import load_system_prompt

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRATCH_PROMPTS_PATH = REPO_ROOT / "scratch" / "scratch_prompts.json"
SCRATCH_RUNS_DIR = REPO_ROOT / "scratch" / "runs"
SCHEMA_PATH = REPO_ROOT / "schema" / "architecture.generation.schema.json"


def load_scratch_prompts(path: Path = SCRATCH_PROMPTS_PATH) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def run_scratch(
    *,
    model: str,
    mode: str,
    client: Any,
    out_dir: Path = SCRATCH_RUNS_DIR,
    prompts_path: Path = SCRATCH_PROMPTS_PATH,
    schema_path: Path = SCHEMA_PATH,
) -> list[Path]:
    if mode not in RESPONSE_MODES:
        raise ValueError(f"unknown response mode: {mode!r}")

    prompts = load_scratch_prompts(prompts_path)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    config = GenerationConfig(
        temperature=constants.TEMPERATURE,
        max_tokens=4096,
        timeout_s=constants.TIMEOUT_S,
        max_attempts=constants.MAX_ATTEMPTS,
        response_mode=mode,
        system_prompt=load_system_prompt(),
        schema=schema,
    )

    target = out_dir / model / mode
    target.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for prompt in prompts:
        result = generate(client, prompt["prompt"], config)
        record = {
            "model": model,
            "mode": mode,
            "prompt_id": prompt["id"],
            "kind": prompt.get("kind"),
            "final_status": result.status,
            "first_attempt_schema_valid": result.first_attempt_schema_valid,
            "attempts": [attempt.to_record() for attempt in result.attempts],
            "output_tokens": sum(
                int(attempt.usage.get("completion_tokens") or 0)
                for attempt in result.attempts
            ),
        }
        path = target / f"{prompt['id']}.json"
        path.write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        written.append(path)

    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the scratch set. Never scored.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--mode", required=True, choices=list(RESPONSE_MODES))
    args = parser.parse_args(argv)

    try:
        settings = load_settings()
        client = ChatClient(
            base_url=settings.base_url,
            api_key=settings.api_key,
            model=args.model,
            timeout_s=constants.TIMEOUT_S,
        )
        written = run_scratch(model=args.model, mode=args.mode, client=client)
    except SettingsError as error:
        print(f"settings error: {error}", file=sys.stderr)
        return 1

    for path in written:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
