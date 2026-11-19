"""Scratch runs only. This module cannot see ``eval/eval_set.json``.

Scratch runs choose the response mode, ``max_tokens`` and system-prompt wording.
They are never scored and never counted.

Every call records ``finish_reason``. A response truncated by the token cap
(``finish_reason == "length"``) is rerun with a higher cap before its token count
may be used for the ``max_tokens`` measurement.

A 429 stops the whole scratch invocation; it is never retried. Completed
records are skipped on the next invocation, so a stop-and-resume costs only the
unfinished prompts.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.eval import constants
from app.llm.budget import BudgetExhausted, BudgetedClient
from app.llm.client import ChatClient
from app.llm.generate import RESPONSE_MODES, GenerationConfig, GenerationResult, generate
from app.llm.settings import (
    API_KEY_VAR,
    BASE_URL_VAR,
    SettingsError,
    load_model_settings,
)
from app.llm.system_prompt import load_system_prompt

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRATCH_PROMPTS_PATH = REPO_ROOT / "scratch" / "scratch_prompts.json"
SCRATCH_RUNS_DIR = REPO_ROOT / "scratch" / "runs"
SCHEMA_PATH = REPO_ROOT / "schema" / "architecture.generation.schema.json"

#: First cap tried. Doubled on a truncated response, up to the ceiling.
SCRATCH_START_MAX_TOKENS = 4096
SCRATCH_MAX_TOKENS_CEILING = 32768
SCRATCH_MAX_CAPS = 4

#: Hard cap per model invocation. 10 base calls + 6 recovery calls.
SCRATCH_MAX_CALLS_PER_MODEL = 16


def load_scratch_prompts(path: Path = SCRATCH_PROMPTS_PATH) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def _caps() -> list[int]:
    caps = [SCRATCH_START_MAX_TOKENS]
    while len(caps) < SCRATCH_MAX_CAPS and caps[-1] * 2 <= SCRATCH_MAX_TOKENS_CEILING:
        caps.append(caps[-1] * 2)
    return caps


def _completion_tokens(result: GenerationResult) -> int:
    return sum(
        int(attempt.usage.get("completion_tokens") or 0)
        for attempt in result.attempts
    )


def _max_completion_tokens(result: GenerationResult) -> int:
    return max(
        (
            int(attempt.usage.get("completion_tokens") or 0)
            for attempt in result.attempts
        ),
        default=0,
    )


def _run_payload(cap: int, result: GenerationResult) -> dict[str, Any]:
    return {
        "cap": cap,
        "final_status": result.status,
        "first_attempt_schema_valid": result.first_attempt_schema_valid,
        "attempts": [attempt.to_record() for attempt in result.attempts],
        "finish_reasons": [attempt.finish_reason for attempt in result.attempts],
        "output_tokens": _completion_tokens(result),
        "max_completion_tokens": _max_completion_tokens(result),
    }


def _settled(record: dict[str, Any]) -> bool:
    """True when rerunning the prompt cannot add usable evidence.

    ``rate_limited`` and ``transport_error`` are the only statuses worth
    resuming. A schema-invalid result, a failed timeout, or truncation at the
    ceiling is already the answer for that prompt.
    """

    if record.get("measurement_usable"):
        return True
    if record.get("final_status") in {"schema_invalid", "timeout_failed"}:
        return True
    if (
        record.get("truncated")
        and record.get("cap_used") == SCRATCH_MAX_TOKENS_CEILING
    ):
        return True
    return False


def _existing_record(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def run_scratch(
    *,
    model: str,
    mode: str,
    client: Any,
    model_id: str | None = None,
    out_dir: Path = SCRATCH_RUNS_DIR,
    prompts_path: Path = SCRATCH_PROMPTS_PATH,
    schema_path: Path = SCHEMA_PATH,
    max_calls: int | None = SCRATCH_MAX_CALLS_PER_MODEL,
    force: bool = False,
) -> list[Path]:
    if mode not in RESPONSE_MODES:
        raise ValueError(f"unknown response mode: {mode!r}")

    prompts = load_scratch_prompts(prompts_path)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    system_prompt = load_system_prompt()
    budgeted = client if max_calls is None else BudgetedClient(client, max_calls)

    target = out_dir / model / mode
    target.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for prompt in prompts:
        path = target / f"{prompt['id']}.json"
        existing = _existing_record(path)
        if not force and existing is not None and _settled(existing):
            continue

        runs: list[dict[str, Any]] = []
        stop_after_record = False
        for cap in _caps():
            config = GenerationConfig(
                temperature=constants.TEMPERATURE,
                max_tokens=cap,
                timeout_s=constants.TIMEOUT_S,
                max_attempts=constants.MAX_ATTEMPTS,
                response_mode=mode,
                system_prompt=system_prompt,
                schema=schema,
            )
            result = generate(budgeted, prompt["prompt"], config)
            runs.append(_run_payload(cap, result))
            if result.status == "rate_limited":
                stop_after_record = True
                break
            if not any(reason == "length" for reason in runs[-1]["finish_reasons"]):
                break

        final = runs[-1]
        truncated = any(
            reason == "length"
            for run in runs
            for reason in run["finish_reasons"]
        )
        measurement_usable = (
            final["final_status"] == "schema_valid"
            and "length" not in final["finish_reasons"]
        )

        record = {
            "model": model,
            "model_id": model_id or model,
            "mode": mode,
            "prompt_id": prompt["id"],
            "kind": prompt.get("kind"),
            "cap_used": final["cap"],
            "caps_tried": [run["cap"] for run in runs],
            "truncated": truncated,
            "measurement_usable": measurement_usable,
            "final_status": final["final_status"],
            "first_attempt_schema_valid": final["first_attempt_schema_valid"],
            "calls": sum(len(run["attempts"]) for run in runs),
            "attempts": final["attempts"],
            "finish_reasons": final["finish_reasons"],
            "output_tokens": final["output_tokens"],
            "max_completion_tokens": final["max_completion_tokens"],
            "runs": runs,
        }
        path.write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        written.append(path)

        if stop_after_record:
            break

    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the scratch set. Never scored.")
    parser.add_argument("--model", required=True, help="Directory name for the run.")
    parser.add_argument("--mode", required=True, choices=list(RESPONSE_MODES))
    parser.add_argument(
        "--model-id",
        default=None,
        help="Provider model id. Defaults to LLM_MODEL.",
    )
    parser.add_argument(
        "--base-url-env",
        default=BASE_URL_VAR,
        help=f"Name of the base-URL variable (default {BASE_URL_VAR}).",
    )
    parser.add_argument(
        "--api-key-env",
        default=API_KEY_VAR,
        help=f"Name of the API-key variable (default {API_KEY_VAR}).",
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=SCRATCH_MAX_CALLS_PER_MODEL,
        help=(
            "Hard call cap for this invocation "
            f"(default {SCRATCH_MAX_CALLS_PER_MODEL})."
        ),
    )
    parser.add_argument("--force", action="store_true", help="Rerun settled records.")
    args = parser.parse_args(argv)

    entry = {
        "model_id": args.model_id,
        "base_url_env": args.base_url_env,
        "api_key_env": args.api_key_env,
    }

    try:
        settings = load_model_settings(entry)
        client = ChatClient(
            base_url=settings.base_url,
            api_key=settings.api_key,
            model=settings.model,
            timeout_s=constants.TIMEOUT_S,
        )
        written = run_scratch(
            model=args.model,
            mode=args.mode,
            client=client,
            model_id=args.model_id,
            max_calls=args.max_calls,
            force=args.force,
        )
    except SettingsError as error:
        print(f"settings error: {error}", file=sys.stderr)
        return 1
    except BudgetExhausted as error:
        print(f"stopped: {error}; rerun the same command to resume", file=sys.stderr)
        return 3

    for path in written:
        print(f"wrote {path}")

    if written:
        last = _existing_record(written[-1]) or {}
        if last.get("final_status") == "rate_limited":
            print(
                "stopped on HTTP 429; rerun the same command to resume",
                file=sys.stderr,
            )
            return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
