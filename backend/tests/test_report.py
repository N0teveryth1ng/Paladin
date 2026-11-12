"""The report is mechanical, per-model and refuses to invent a verdict."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.eval import constants
from app.eval.models import EvalSet
from app.eval.report import generate_report

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_SET_PATH = REPO_ROOT / "eval" / "eval_set.json"
FREEZE_PATH = REPO_ROOT / "eval" / "freeze.json"

ARCHITECTURE = {
    "title": "Test",
    "components": [
        {"id": "cmp_a", "type": "service", "technology": "FastAPI"},
        {"id": "cmp_b", "type": "database", "technology": "PostgreSQL"},
    ],
    "connections": [
        {"id": "cnx_a", "from": "cmp_a", "to": "cmp_b", "type": "sync", "label": "writes"}
    ],
    "groups": [{"id": "grp_a", "members": ["cmp_a", "cmp_b"], "parent_id": None}],
    "flags": [
        {
            "id": "flg_a",
            "kind": "contradiction",
            "severity": "warning",
            "description": "A warning flag.",
        }
    ],
    "assumptions": [{"id": "asm_a", "text": "Traffic is modest."}],
}


def eval_set() -> EvalSet:
    return EvalSet.model_validate(
        json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))
    )


def human_item_ids(prompt) -> list[str]:
    return [
        item.id
        for item in (*prompt.must_include, *prompt.must_not_include)
        if item.check == "human"
    ]


def default_rule(prompt, gate_passed: bool) -> str:
    if prompt.blocking_flag_expected == "required":
        return "required_met" if gate_passed else "required_missing"
    if prompt.blocking_flag_expected == "forbidden":
        return "forbidden_met" if gate_passed else "forbidden_violated"
    return "optional_skipped"


def write_run(
    runs_dir: Path,
    model: str,
    prompt,
    run_index: int,
    *,
    gate_passed: bool,
    first_attempt: bool,
    blocking_rule: str | None = None,
    status: str = "schema_valid",
) -> None:
    prompt_dir = runs_dir / model / prompt.id
    prompt_dir.mkdir(parents=True, exist_ok=True)
    architecture_path = f"{model}/{prompt.id}/run-{run_index}.architecture.json"
    (runs_dir / architecture_path).write_text(
        json.dumps(ARCHITECTURE, indent=2), encoding="utf-8"
    )
    record = {
        "prompt_id": prompt.id,
        "run_index": run_index,
        "final_status": status,
        "first_attempt_schema_valid": first_attempt,
        "attempts": [
            {
                "index": 1,
                "outcome": "schema_valid" if first_attempt else "schema_invalid",
                "error_kind": None if first_attempt else "json",
                "blocking_flag_rule_only": False,
            }
        ],
        "gate": {
            "passed": gate_passed,
            "failed_items": [] if gate_passed else ["r01"],
            "blocking_flag_rule": blocking_rule or default_rule(prompt, gate_passed),
        },
        "architecture_path": architecture_path,
    }
    (prompt_dir / f"run-{run_index}.json").write_text(
        json.dumps(record, indent=2), encoding="utf-8"
    )


def build_model(
    runs_dir: Path,
    model: str,
    *,
    run_gate_overrides: dict[tuple[str, int], bool] | None = None,
    human_failing: set[str] | None = None,
    omit: tuple[str, str] | None = None,
    first_attempt_valid: int = constants.TOTAL_RUNS,
) -> None:
    overrides = run_gate_overrides or {}
    failing = human_failing or set()
    index = 0

    for prompt in eval_set().prompts:
        for run_index in range(1, constants.RUNS_PER_PROMPT + 1):
            index += 1
            gate_passed = overrides.get((prompt.id, run_index), True)
            write_run(
                runs_dir,
                model,
                prompt,
                run_index,
                gate_passed=gate_passed,
                first_attempt=index <= first_attempt_valid,
            )

    scores: dict[str, dict[str, str]] = {}
    for prompt in eval_set().prompts:
        ids = human_item_ids(prompt)
        if not ids:
            continue
        values = {
            item_id: ("fail" if prompt.id in failing else "pass") for item_id in ids
        }
        if omit is not None and omit[0] == prompt.id:
            values.pop(omit[1], None)
        scores[prompt.id] = values

    (runs_dir / model / "human_scores.json").write_text(
        json.dumps({"model": model, "scores": scores}, indent=2), encoding="utf-8"
    )


def report_for(runs_dir: Path) -> str:
    return generate_report(runs_dir, FREEZE_PATH, EVAL_SET_PATH)


def test_counts_are_per_model_and_never_averaged(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a")
    build_model(tmp_path, "model-b", first_attempt_valid=20)

    text = report_for(tmp_path)

    assert "## Model: model-a" in text
    assert "## Model: model-b" in text
    assert "First-attempt schema-valid: 45/45" in text
    assert "First-attempt schema-valid: 20/45" in text


def test_two_of_three_gate_maths(tmp_path: Path) -> None:
    build_model(
        tmp_path,
        "model-a",
        run_gate_overrides={("ev_01", 2): False, ("ev_01", 3): False},
    )
    assert "Prompts passing the deterministic gate (2 of 3): 14/15" in report_for(
        tmp_path
    )

    second = tmp_path / "second"
    build_model(
        second,
        "model-a",
        run_gate_overrides={("ev_01", 3): False},
    )
    assert "Prompts passing the deterministic gate (2 of 3): 15/15" in report_for(second)


def test_first_attempt_count_and_failure_kinds(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a", first_attempt_valid=41)
    text = report_for(tmp_path)

    assert "First-attempt schema-valid: 41/45" in text
    assert "First-attempt failures by kind: json=4" in text


def test_blocking_flag_counts(tmp_path: Path) -> None:
    build_model(
        tmp_path,
        "model-a",
        run_gate_overrides={
            ("ev_13", 2): False,
            ("ev_13", 3): False,
            ("ev_05", 1): False,
        },
    )
    text = report_for(tmp_path)

    assert "Blocking flag required, flagged: 1/2" in text
    assert "Blocking flag forbidden, violated: 1/12" in text
    assert "Blocking flag optional: skipped (1 prompt(s))" in text


def test_infrastructure_runs_are_excluded_and_make_the_model_incomplete(
    tmp_path: Path,
) -> None:
    build_model(tmp_path, "model-a")
    infra_dir = tmp_path / "model-a" / "ev_99"
    infra_dir.mkdir(parents=True)
    (infra_dir / "run-1.json").write_text(
        json.dumps(
            {
                "prompt_id": "ev_99",
                "run_index": 1,
                "final_status": "rate_limited",
                "first_attempt_schema_valid": False,
                "attempts": [],
                "gate": {"passed": False, "failed_items": [], "blocking_flag_rule": "not_evaluated"},
            }
        ),
        encoding="utf-8",
    )

    text = report_for(tmp_path)

    assert "Counted runs: 45/45 (infrastructure failures excluded: 1)" in text
    assert "Status: INCOMPLETE" in text
    assert "Verdict: none" in text


def test_missing_human_score_blocks_the_verdict(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a", omit=("ev_01", "r07"))

    text = report_for(tmp_path)

    assert "Status: HUMAN SCORING INCOMPLETE" in text
    assert "Verdict: none" in text
    assert "Verdict: PASS" not in text


def test_missing_human_file_blocks_the_verdict(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a")
    (tmp_path / "model-a" / "human_scores.json").unlink()

    text = report_for(tmp_path)

    assert "Status: HUMAN SCORING INCOMPLETE" in text
    assert "Verdict: none" in text


def test_full_human_scores_produce_a_mechanical_verdict(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a")
    assert "Verdict: PASS" in report_for(tmp_path)


def test_thirteen_prompts_pass_but_twelve_fail(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a", human_failing={"ev_01", "ev_02", "ev_03"})
    assert "Prompts passing gate + human items: 12/15" in report_for(tmp_path)
    assert "Verdict: FAIL" in report_for(tmp_path)

    thirteen = tmp_path / "thirteen"
    build_model(thirteen, "model-a", human_failing={"ev_01", "ev_02"})
    assert "Prompts passing gate + human items: 13/15" in report_for(thirteen)
    assert "Verdict: PASS" in report_for(thirteen)


def test_complex_gate_can_fail_the_verdict(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a", human_failing={"ev_09", "ev_01"})
    text = report_for(tmp_path)

    assert "Prompts passing gate + human items: 13/15" in text
    assert "Complex passing: 3/4" in text
    assert "Verdict: FAIL" in text


def test_adversarial_gate_can_fail_the_verdict(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a", human_failing={"ev_13", "ev_01"})
    text = report_for(tmp_path)

    assert "Prompts passing gate + human items: 13/15" in text
    assert "Adversarial passing: 2/3" in text
    assert "Verdict: FAIL" in text


def test_first_attempt_bar_can_fail_the_verdict(tmp_path: Path) -> None:
    build_model(tmp_path, "model-a", first_attempt_valid=40)
    assert "First-attempt schema-valid: 40/45" in report_for(tmp_path)
    assert "Verdict: FAIL" in report_for(tmp_path)

    passing = tmp_path / "passing"
    build_model(passing, "model-a", first_attempt_valid=41)
    assert "First-attempt schema-valid: 41/45" in report_for(passing)
    assert "Verdict: PASS" in report_for(passing)


def test_human_sheet_renders_the_architecture_without_the_model_name(
    tmp_path: Path,
) -> None:
    build_model(tmp_path, "secret-model-name")
    report_for(tmp_path)

    sheet = (tmp_path / "human_sheet.md").read_text(encoding="utf-8")
    key = json.loads((tmp_path / "human_sheet_key.json").read_text(encoding="utf-8"))

    for heading in (
        "Components:",
        "Connections:",
        "Groups:",
        "Flags:",
        "Assumptions:",
    ):
        assert heading in sheet
    assert "cmp_a" in sheet
    assert "cmp_a -> cmp_b (sync) 'writes'" in sheet
    assert "grp_a" in sheet
    assert "flg_a" in sheet
    assert "asm_a" in sheet
    assert "secret-model-name" not in sheet
    assert key == {"Model A": "secret-model-name"}


def test_constants_match_the_readme_block() -> None:
    readme = (REPO_ROOT / "eval" / "README.md").read_text(encoding="utf-8")
    start = readme.index("<!-- constants:begin -->")
    end = readme.index("<!-- constants:end -->")
    match = re.search(r"```json\s*(.*?)\s*```", readme[start:end], re.DOTALL)
    assert match is not None
    documented = json.loads(match.group(1))
    assert documented == constants.ALL_VALUES
