"""Mechanical report over run records plus the human-score file.

The agent never writes ``runs/<model>/human_scores.json``. The verdict is
computed only from ``app.eval.constants``; missing evidence yields
``INCOMPLETE`` or ``HUMAN SCORING INCOMPLETE`` instead of a verdict.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.eval import constants
from app.eval.models import EvalPrompt, EvalSet

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EVAL_SET = REPO_ROOT / "eval" / "eval_set.json"
DEFAULT_FREEZE = REPO_ROOT / "eval" / "freeze.json"
DEFAULT_OUT = REPO_ROOT / "runs"


@dataclass
class PromptAnalysis:
    prompt: EvalPrompt
    counted_runs: int = 0
    gate_runs: int = 0
    first_gate_run: int | None = None
    human_missing: list[str] = field(default_factory=list)
    human_failed: list[str] = field(default_factory=list)

    @property
    def gate_passed(self) -> bool:
        return self.gate_runs >= constants.GATE_RUNS_REQUIRED

    @property
    def passed(self) -> bool:
        return self.gate_passed and not self.human_missing and not self.human_failed


@dataclass
class ModelAnalysis:
    model: str
    counted: list[dict[str, Any]] = field(default_factory=list)
    infrastructure: list[dict[str, Any]] = field(default_factory=list)
    prompts: dict[str, PromptAnalysis] = field(default_factory=dict)
    human_file_present: bool = False

    @property
    def incomplete(self) -> bool:
        return bool(self.infrastructure) or len(self.counted) < constants.TOTAL_RUNS

    @property
    def human_incomplete(self) -> bool:
        return any(prompt.human_missing for prompt in self.prompts.values())

    @property
    def gate_prompt_count(self) -> int:
        return sum(1 for prompt in self.prompts.values() if prompt.gate_passed)

    @property
    def passed_prompt_count(self) -> int:
        return sum(1 for prompt in self.prompts.values() if prompt.passed)

    @property
    def complex_passed(self) -> int:
        return sum(
            1
            for prompt in self.prompts.values()
            if prompt.prompt.category == "complex" and prompt.passed
        )

    @property
    def adversarial_passed(self) -> int:
        return sum(
            1
            for prompt in self.prompts.values()
            if prompt.prompt.category == "adversarial" and prompt.passed
        )

    @property
    def runs_gate_passed(self) -> int:
        return sum(1 for run in self.counted if run.get("gate", {}).get("passed"))

    @property
    def first_attempt_schema_valid(self) -> int:
        return sum(1 for run in self.counted if run.get("first_attempt_schema_valid"))

    @property
    def first_attempt_failures_by_kind(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for run in self.counted:
            if run.get("first_attempt_schema_valid"):
                continue
            attempts = run.get("attempts") or []
            kind = "unknown"
            if attempts:
                kind = attempts[0].get("error_kind") or attempts[0].get("outcome") or "unknown"
            counts[kind] = counts.get(kind, 0) + 1
        return counts

    def blocking_counts(self) -> tuple[int, int, int]:
        required_total = 0
        required_flagged = 0
        forbidden_total = 0
        forbidden_violations = 0
        optional_total = 0
        for analysis in self.prompts.values():
            expectation = analysis.prompt.blocking_flag_expected
            runs = [
                run
                for run in self.counted
                if run.get("prompt_id") == analysis.prompt.id
            ]
            if expectation == "required":
                required_total += 1
                if sum(
                    1
                    for run in runs
                    if run.get("gate", {}).get("blocking_flag_rule") == "required_met"
                ) >= constants.GATE_RUNS_REQUIRED:
                    required_flagged += 1
            elif expectation == "forbidden":
                forbidden_total += 1
                if any(
                    run.get("gate", {}).get("blocking_flag_rule")
                    == "forbidden_violated"
                    for run in runs
                ):
                    forbidden_violations += 1
            else:
                optional_total += 1
        return required_flagged, forbidden_violations, optional_total

    def rule_only_retries(self) -> tuple[int, int, int]:
        retries = 0
        resolved = 0
        unresolved = 0
        for run in self.counted:
            hits = [
                attempt
                for attempt in (run.get("attempts") or [])
                if attempt.get("blocking_flag_rule_only")
            ]
            if not hits:
                continue
            retries += len(hits)
            if run.get("final_status") == "schema_valid":
                resolved += 1
            else:
                unresolved += 1
        return retries, resolved, unresolved

    @property
    def verdict(self) -> str | None:
        if self.incomplete or self.human_incomplete:
            return None
        if (
            self.passed_prompt_count >= constants.MIN_PROMPTS_PASSED
            and self.complex_passed == constants.MIN_COMPLEX_PASSED
            and self.adversarial_passed == constants.MIN_ADVERSARIAL_PASSED
            and self.first_attempt_schema_valid
            >= constants.MIN_FIRST_ATTEMPT_SCHEMA_VALID
        ):
            return "PASS"
        return "FAIL"


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _model_dirs(runs_dir: Path) -> list[Path]:
    if not runs_dir.is_dir():
        return []
    return sorted(
        path
        for path in runs_dir.iterdir()
        if path.is_dir() and any(path.glob("ev_*/run-*.json"))
    )


def _human_item_ids(prompt: EvalPrompt) -> list[str]:
    return [
        item.id
        for item in (*prompt.must_include, *prompt.must_not_include)
        if item.check == "human"
    ]


def analyse_model(
    model_dir: Path,
    model: str,
    eval_set: EvalSet,
    human_scores: dict[str, Any] | None,
) -> ModelAnalysis:
    analysis = ModelAnalysis(model=model, human_file_present=human_scores is not None)
    scores = (human_scores or {}).get("scores") or {}

    records: list[dict[str, Any]] = []
    for path in sorted(model_dir.glob("ev_*/run-*.json")):
        try:
            records.append(_load_json(path))
        except (OSError, json.JSONDecodeError):
            continue

    for record in records:
        status = record.get("final_status")
        if status in constants.INFRASTRUCTURE_STATUSES:
            analysis.infrastructure.append(record)
        elif status in constants.TERMINAL_STATUSES:
            analysis.counted.append(record)

    for prompt in eval_set.prompts:
        prompt_analysis = PromptAnalysis(prompt=prompt)
        runs = sorted(
            (run for run in analysis.counted if run.get("prompt_id") == prompt.id),
            key=lambda run: run.get("run_index", 0),
        )
        prompt_analysis.counted_runs = len(runs)
        prompt_analysis.gate_runs = sum(
            1 for run in runs if run.get("gate", {}).get("passed")
        )

        first_gate = next(
            (run for run in runs if run.get("gate", {}).get("passed")), None
        )
        if first_gate is not None:
            prompt_analysis.first_gate_run = first_gate.get("run_index")
            prompt_scores = scores.get(prompt.id) or {}
            for item_id in _human_item_ids(prompt):
                value = prompt_scores.get(item_id)
                if value not in {"pass", "fail"}:
                    prompt_analysis.human_missing.append(item_id)
                elif value == "fail":
                    prompt_analysis.human_failed.append(item_id)

        analysis.prompts[prompt.id] = prompt_analysis

    return analysis


def _render_model(analysis: ModelAnalysis) -> str:
    required_flagged, forbidden_violations, optional_total = analysis.blocking_counts()
    retries, resolved, unresolved = analysis.rule_only_retries()
    failures = analysis.first_attempt_failures_by_kind

    lines = [f"## Model: {analysis.model}", ""]
    lines.append(
        f"- Counted runs: {len(analysis.counted)}/{constants.TOTAL_RUNS} "
        f"(infrastructure failures excluded: {len(analysis.infrastructure)})"
    )
    lines.append(
        "- Prompts passing the deterministic gate "
        f"({constants.GATE_RUNS_REQUIRED} of {constants.RUNS_PER_PROMPT}): "
        f"{analysis.gate_prompt_count}/{constants.TOTAL_PROMPTS}"
    )
    lines.append(
        f"- Prompts passing gate + human items: "
        f"{analysis.passed_prompt_count}/{constants.TOTAL_PROMPTS}"
    )
    lines.append(
        f"- Complex passing: {analysis.complex_passed}/{constants.TOTAL_COMPLEX}"
    )
    lines.append(
        f"- Adversarial passing: {analysis.adversarial_passed}/{constants.TOTAL_ADVERSARIAL}"
    )
    lines.append(
        f"- Runs passing the gate: {analysis.runs_gate_passed}/{constants.TOTAL_RUNS}"
    )
    lines.append(
        f"- First-attempt schema-valid: "
        f"{analysis.first_attempt_schema_valid}/{constants.TOTAL_RUNS}"
    )
    if failures:
        detail = ", ".join(f"{kind}={count}" for kind, count in sorted(failures.items()))
        lines.append(f"- First-attempt failures by kind: {detail}")
    lines.append(
        f"- Blocking flag required, flagged: "
        f"{required_flagged}/{sum(1 for p in analysis.prompts.values() if p.prompt.blocking_flag_expected == 'required')}"
    )
    lines.append(
        f"- Blocking flag forbidden, violated: "
        f"{forbidden_violations}/{sum(1 for p in analysis.prompts.values() if p.prompt.blocking_flag_expected == 'forbidden')}"
    )
    lines.append(
        f"- Blocking flag optional: skipped ({optional_total} prompt(s))"
    )
    lines.append(
        f"- Blocking-flag-rule-only retries: {retries} "
        f"(resolved {resolved}, unresolved {unresolved})"
    )
    if analysis.infrastructure:
        kinds: dict[str, int] = {}
        for run in analysis.infrastructure:
            kind = run.get("final_status") or "unknown"
            kinds[kind] = kinds.get(kind, 0) + 1
        detail = ", ".join(f"{kind}={count}" for kind, count in sorted(kinds.items()))
        lines.append(f"- Infrastructure failures remaining: {detail}")

    failing = [
        prompt_id
        for prompt_id, prompt in analysis.prompts.items()
        if not prompt.gate_passed
    ]
    if failing:
        lines.append(f"- Prompts failing the gate: {', '.join(failing)}")

    lines.append("")
    if analysis.incomplete:
        lines.append("Status: INCOMPLETE")
    if analysis.human_incomplete:
        missing = [
            f"{prompt_id} {item}"
            for prompt_id, prompt in analysis.prompts.items()
            for item in prompt.human_missing
        ]
        lines.append("Status: HUMAN SCORING INCOMPLETE")
        if missing:
            lines.append(f"Missing human scores: {', '.join(missing)}")
    if analysis.verdict is None:
        lines.append("Verdict: none")
    else:
        lines.append(f"Verdict: {analysis.verdict}")
    return "\n".join(lines)


def _render_architecture(payload: dict[str, Any]) -> list[str]:
    lines: list[str] = []

    lines.append("Components:")
    for component in payload.get("components") or []:
        technology = component.get("technology") or "null"
        lines.append(
            f"- {component.get('id')} ({component.get('type')}, {technology})"
        )

    lines.append("")
    lines.append("Connections:")
    connections = payload.get("connections") or []
    if not connections:
        lines.append("- none")
    for connection in connections:
        lines.append(
            f"- {connection.get('from')} -> {connection.get('to')} "
            f"({connection.get('type')}) {connection.get('label')!r}"
        )

    lines.append("")
    lines.append("Groups:")
    groups = payload.get("groups") or []
    if not groups:
        lines.append("- none")
    for group in groups:
        parent = f" parent={group.get('parent_id')}" if group.get("parent_id") else ""
        lines.append(
            f"- {group.get('id')}: {', '.join(group.get('members') or [])}{parent}"
        )

    lines.append("")
    lines.append("Flags:")
    flags = payload.get("flags") or []
    if not flags:
        lines.append("- none")
    for flag in flags:
        lines.append(
            f"- {flag.get('id')} ({flag.get('kind')}, {flag.get('severity')}): "
            f"{flag.get('description')}"
        )

    lines.append("")
    lines.append("Assumptions:")
    assumptions = payload.get("assumptions") or []
    if not assumptions:
        lines.append("- none")
    for assumption in assumptions:
        lines.append(f"- {assumption.get('id')}: {assumption.get('text')}")

    return lines


def render_human_sheet(
    runs_dir: Path, analyses: list[ModelAnalysis], eval_set: EvalSet
) -> tuple[str, dict[str, str]]:
    labels = {analysis.model: f"Model {chr(ord('A') + index)}" for index, analysis in enumerate(analyses)}
    key = {label: model for model, label in labels.items()}

    lines = [
        "# Human scoring sheet",
        "",
        "Score only the first gate-passing run of each prompt. The model names are",
        "in `human_sheet_key.json`; this sheet deliberately does not show them.",
        "",
    ]

    for prompt in eval_set.prompts:
        lines.append(f"## {prompt.id} - {prompt.title}")
        lines.append("")

        for analysis in analyses:
            prompt_analysis = analysis.prompts.get(prompt.id)
            if prompt_analysis is None or prompt_analysis.first_gate_run is None:
                continue

            label = labels[analysis.model]
            record_path = (
                runs_dir
                / analysis.model
                / prompt.id
                / f"run-{prompt_analysis.first_gate_run}.json"
            )
            lines.append(f"### {label} (run {prompt_analysis.first_gate_run})")
            lines.append("")

            try:
                record = _load_json(record_path)
            except (OSError, json.JSONDecodeError):
                record = {}
            architecture_path = record.get("architecture_path")
            if not architecture_path:
                lines.append("(architecture file missing)")
                lines.append("")
                continue

            try:
                payload = _load_json(runs_dir / architecture_path)
            except (OSError, json.JSONDecodeError):
                lines.append("(architecture file missing)")
                lines.append("")
                continue

            lines.extend(_render_architecture(payload))
            lines.append("")

        lines.append("")

    return "\n".join(lines).rstrip() + "\n", key


def generate_report(
    runs_dir: Path = DEFAULT_OUT,
    freeze_path: Path = DEFAULT_FREEZE,
    eval_set_path: Path = DEFAULT_EVAL_SET,
) -> str:
    eval_set = EvalSet.model_validate(_load_json(eval_set_path))
    freeze = _load_json(freeze_path)

    analyses: list[ModelAnalysis] = []
    for model_dir in _model_dirs(runs_dir):
        model = model_dir.name
        human_path = model_dir / "human_scores.json"
        human_scores = _load_json(human_path) if human_path.is_file() else None
        analyses.append(analyse_model(model_dir, model, eval_set, human_scores))

    lines = [
        "# Paladin evaluation report",
        "",
        f"Eval set SHA-256: {freeze.get('eval_set_sha256')}",
        f"System prompt: {freeze.get('system_prompt_version')} "
        f"({freeze.get('system_prompt_sha256')})",
        f"Models: {len(analyses)}",
        "",
    ]

    if not analyses:
        lines.append("No run records found.")
    for analysis in analyses:
        lines.append(_render_model(analysis))
        lines.append("")

    sheet, key = render_human_sheet(runs_dir, analyses, eval_set)
    (runs_dir / "human_sheet.md").write_text(sheet, encoding="utf-8", newline="\n")
    (runs_dir / "human_sheet_key.json").write_text(
        json.dumps(key, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    text = "\n".join(lines).rstrip() + "\n"
    (runs_dir / "report.md").write_text(text, encoding="utf-8", newline="\n")
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compute the mechanical report.")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    runs_dir = Path(args.out)
    if not runs_dir.is_dir():
        print(f"no run directory: {runs_dir}", file=sys.stderr)
        return 1

    print(generate_report(runs_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
