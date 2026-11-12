"""The frozen scored runner.

It refuses before making a single call when the eval set drifted, the harness is
not approved, ``max_tokens`` is unmeasured, or the model has no recorded
response mode. It never reads ``scratch/``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from app.eval import constants
from app.eval.evaluate import deterministic_gate
from app.eval.models import EvalPrompt, EvalSet
from app.llm.generate import (
    REASONING_TRANSFORMS,
    GenerationConfig,
    GenerationResult,
    generate,
)
from app.llm.system_prompt import load_system_prompt, system_prompt_sha256

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EVAL_SET = REPO_ROOT / "eval" / "eval_set.json"
DEFAULT_FREEZE = REPO_ROOT / "eval" / "freeze.json"
DEFAULT_SCHEMA = REPO_ROOT / "schema" / "architecture.generation.schema.json"
DEFAULT_OUT = REPO_ROOT / "runs"


class RefusalError(RuntimeError):
    """Raised before any provider call. The message is printed verbatim."""


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest().upper()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _max_measurement(freeze: dict[str, Any]) -> int | None:
    measurements = freeze.get("max_tokens_measurements") or []
    values = [
        entry.get("output_tokens")
        for entry in measurements
        if isinstance(entry, dict) and isinstance(entry.get("output_tokens"), int)
    ]
    return max(values) if values else None


def check_preconditions(
    freeze: dict[str, Any], eval_set_path: Path, model: str
) -> None:
    """Every refusal happens here, before anything is written."""

    actual_hash = sha256_file(eval_set_path)
    expected_hash = freeze.get("eval_set_sha256")
    if actual_hash != expected_hash:
        raise RefusalError(
            "eval set hash mismatch: "
            f"freeze={expected_hash} actual={actual_hash}"
        )

    if freeze.get("scored_run_approved") is not True:
        raise RefusalError("the harness is not approved for a scored run")

    max_tokens = freeze.get("max_tokens")
    measurement = _max_measurement(freeze)
    if (
        measurement is None
        or not isinstance(max_tokens, int)
        or max_tokens < 2 * measurement
    ):
        raise RefusalError("max_tokens is unmeasured or lacks 2x headroom")

    models = freeze.get("models") or {}
    if model not in models:
        raise RefusalError(
            f"model {model!r} has no recorded response mode in freeze.json"
        )

    if freeze.get("thresholds") != constants.THRESHOLDS:
        raise RefusalError("freeze.json thresholds do not match app.eval.constants")
    if freeze.get("shared_settings") != constants.SHARED_SETTINGS:
        raise RefusalError(
            "freeze.json shared_settings do not match app.eval.constants"
        )

    transform = freeze.get("reasoning_transform")
    if transform is not None and transform not in REASONING_TRANSFORMS:
        raise RefusalError(f"unknown reasoning_transform: {transform!r}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _canonical_json(payload: Any) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def _architecture_payload(result: GenerationResult) -> dict[str, Any] | None:
    if result.draft is None:
        return None
    return result.draft.model_dump(mode="json", by_alias=True)


def _gate_payload(prompt: EvalPrompt, result: GenerationResult) -> dict[str, Any]:
    if result.draft is None:
        return {
            "passed": False,
            "failed_items": [],
            "blocking_flag_rule": "not_evaluated",
        }
    return deterministic_gate(prompt, result.draft).to_record()


def _run_once(
    *,
    client: Any,
    prompt: EvalPrompt,
    config: GenerationConfig,
    reasoning_transform: Callable[[str], str] | None,
    sleep: Callable[[float], None],
) -> tuple[GenerationResult, list[Any]]:
    """Call generation, waiting out rate limits within the frozen budget."""

    all_attempts: list[Any] = []
    waits = 0
    while True:
        result = generate(
            client,
            prompt.prompt,
            config,
            reasoning_transform=reasoning_transform,
        )
        all_attempts.extend(result.attempts)
        if result.status != "rate_limited":
            break
        if waits >= constants.MAX_RATE_LIMIT_WAITS:
            break
        sleep(constants.BACKOFF_SECONDS[min(waits, len(constants.BACKOFF_SECONDS) - 1)])
        waits += 1

    if len(all_attempts) != len(result.attempts):
        result.attempts = [
            replace(attempt, index=index)
            for index, attempt in enumerate(all_attempts, start=1)
        ]
        all_attempts = result.attempts
    return result, all_attempts


def _build_record(
    *,
    model: str,
    base_url: str,
    freeze: dict[str, Any],
    prompt: EvalPrompt,
    run_index: int,
    result: GenerationResult,
    attempts: list[Any],
    started_at: str,
    finished_at: str,
    architecture_path: str | None,
) -> dict[str, Any]:
    shared = freeze["shared_settings"]
    model_entry = freeze["models"][model]

    return {
        "run_id": f"{model}/{prompt.id}/run-{run_index}",
        "model": model,
        "base_url_host": urlsplit(base_url).netloc or base_url,
        "eval_set_sha256": freeze["eval_set_sha256"],
        "prompt_id": prompt.id,
        "prompt_sha256": sha256_text(prompt.prompt),
        "system_prompt_version": freeze["system_prompt_version"],
        "system_prompt_sha256": freeze["system_prompt_sha256"],
        "settings": {
            "temperature": shared["TEMPERATURE"],
            "max_tokens": freeze["max_tokens"],
            "timeout_s": shared["TIMEOUT_S"],
            "response_mode": model_entry["response_mode"],
            "max_attempts": shared["MAX_ATTEMPTS"],
        },
        "run_index": run_index,
        "started_at": started_at,
        "finished_at": finished_at,
        "attempts": [attempt.to_record() for attempt in attempts],
        "final_status": result.status,
        "first_attempt_schema_valid": result.first_attempt_schema_valid,
        "architecture_path": architecture_path,
        "gate": _gate_payload(prompt, result),
    }


def _write_index(model_dir: Path, model: str, eval_set_sha256: str) -> None:
    entries = []
    for path in sorted(model_dir.glob("ev_*/run-*.json")):
        try:
            record = _load_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        entries.append(
            {
                "prompt_id": record.get("prompt_id"),
                "run_index": record.get("run_index"),
                "final_status": record.get("final_status"),
                "first_attempt_schema_valid": record.get("first_attempt_schema_valid"),
                "path": str(path.relative_to(model_dir)),
            }
        )
    index = {
        "model": model,
        "eval_set_sha256": eval_set_sha256,
        "updated_at": _now(),
        "runs": entries,
    }
    (model_dir / "index.json").write_text(_canonical_json(index), encoding="utf-8", newline="\n")


def run_scored(
    *,
    model: str,
    client: Any,
    out_dir: Path = DEFAULT_OUT,
    freeze_path: Path = DEFAULT_FREEZE,
    eval_set_path: Path = DEFAULT_EVAL_SET,
    schema_path: Path = DEFAULT_SCHEMA,
    only_prompt: str | None = None,
    force: bool = False,
    sleep: Callable[[float], None] = time.sleep,
    base_url: str = "",
) -> list[Path]:
    """Run the frozen protocol. Returns the record paths written this call."""

    freeze = _load_json(freeze_path)
    check_preconditions(freeze, eval_set_path, model)

    system_prompt = load_system_prompt()
    actual_prompt_hash = system_prompt_sha256(system_prompt)
    if actual_prompt_hash != freeze.get("system_prompt_sha256"):
        raise RefusalError(
            "system prompt hash mismatch: "
            f"freeze={freeze.get('system_prompt_sha256')} actual={actual_prompt_hash}"
        )

    eval_set = EvalSet.model_validate(_load_json(eval_set_path))
    schema = _load_json(schema_path)
    model_entry = freeze["models"][model]
    transform_name = freeze.get("reasoning_transform")
    reasoning_transform = (
        REASONING_TRANSFORMS[transform_name] if transform_name is not None else None
    )

    config = GenerationConfig(
        temperature=freeze["shared_settings"]["TEMPERATURE"],
        max_tokens=freeze["max_tokens"],
        timeout_s=freeze["shared_settings"]["TIMEOUT_S"],
        max_attempts=freeze["shared_settings"]["MAX_ATTEMPTS"],
        response_mode=model_entry["response_mode"],
        system_prompt=system_prompt,
        schema=schema,
    )

    model_dir = out_dir / model
    written: list[Path] = []

    for prompt in eval_set.prompts:
        if only_prompt is not None and prompt.id != only_prompt:
            continue
        prompt_dir = model_dir / prompt.id
        prompt_dir.mkdir(parents=True, exist_ok=True)

        for run_index in range(1, constants.RUNS_PER_PROMPT + 1):
            record_path = prompt_dir / f"run-{run_index}.json"
            architecture_path = prompt_dir / f"run-{run_index}.architecture.json"

            if record_path.exists() and not force:
                try:
                    existing = _load_json(record_path)
                except (OSError, json.JSONDecodeError):
                    existing = {}
                if existing.get("final_status") in constants.TERMINAL_STATUSES:
                    continue

            started_at = _now()
            result, attempts = _run_once(
                client=client,
                prompt=prompt,
                config=config,
                reasoning_transform=reasoning_transform,
                sleep=sleep,
            )
            finished_at = _now()

            payload = _architecture_payload(result)
            if payload is None:
                if architecture_path.exists():
                    architecture_path.unlink()
                relative_architecture = None
            else:
                architecture_path.write_text(
                    _canonical_json(payload), encoding="utf-8", newline="\n"
                )
                relative_architecture = str(architecture_path.relative_to(out_dir))

            record = _build_record(
                model=model,
                base_url=base_url or getattr(client, "base_url", ""),
                freeze=freeze,
                prompt=prompt,
                run_index=run_index,
                result=result,
                attempts=attempts,
                started_at=started_at,
                finished_at=finished_at,
                architecture_path=relative_architecture,
            )
            record_path.write_text(
                _canonical_json(record), encoding="utf-8", newline="\n"
            )
            written.append(record_path)

        _write_index(model_dir, model, freeze["eval_set_sha256"])

    if model_dir.exists():
        _write_index(model_dir, model, freeze["eval_set_sha256"])
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the frozen evaluation protocol.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    from app.llm.client import ChatClient
    from app.llm.settings import SettingsError, load_settings

    try:
        # Refuse on frozen-harness problems before asking for credentials.
        check_preconditions(_load_json(DEFAULT_FREEZE), DEFAULT_EVAL_SET, args.model)
        settings = load_settings()
        client = ChatClient(
            base_url=settings.base_url,
            api_key=settings.api_key,
            model=settings.model,
            timeout_s=constants.TIMEOUT_S,
        )
        run_scored(
            model=args.model,
            client=client,
            out_dir=Path(args.out),
            only_prompt=args.prompt,
            force=args.force,
            base_url=settings.base_url,
        )
    except RefusalError as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2
    except SettingsError as error:
        print(f"settings error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
