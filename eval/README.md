# Evaluation Set

`eval_set.json` is the single source of truth for the 15 evaluation prompts and
their rubrics. It is versioned (`eval_set_version: "1.0"`) and validated by
`backend/tests/test_eval_set.py`.

## Files

| Path | Purpose |
|---|---|
| `eval/eval_set.json` | The 15 prompts, rubrics, blocking-flag expectations and expected assumptions. |
| `eval/README.md` | This protocol: gate, pass rules, set bar, human scoring, change control, frozen hash. |
| `eval/CHANGELOG.md` | Every change after the set is frozen. |
| `eval/freeze.json` | The frozen harness: eval-set hash, system-prompt hash, thresholds, shared settings, measurements and approval flag. |
| `backend/app/eval/models.py` | Pydantic contract for the set. |
| `backend/app/eval/predicates.py` | Parser and vocabulary validator for deterministic predicates. It does not evaluate predicates. |
| `backend/app/eval/constants.py` | The one place thresholds and fixed settings live. |
| `backend/app/eval/evaluate.py` | Predicate evaluation and the deterministic gate. |
| `backend/app/eval/runner.py` | The frozen scored runner. Refuses on drift, missing approval, unmeasured tokens or an unknown model. |
| `backend/app/eval/report.py` | Mechanical report, human-score ingestion and the human sheet. |
| `prompts/system/architecture-v1.md` | The versioned generation system prompt. |
| `scratch/scratch_prompts.json` | 5 non-eval prompts used only to choose transport settings and prompt wording. |
| `backend/tests/test_eval_set.py` | Set-level validation and the prompt leak guard. |
| `backend/tests/test_predicates.py` | Grammar acceptance and rejection tests. |

## Predicate grammar

Deterministic rubric items use one small grammar over the step 1 graph:

```
component_exists(type=<ComponentType>)
component_exists(type=<ComponentType>, technology~="<substring>")
connection_exists(from_type=<T>, to_type=<T>, type=sync|async)
connection_exists(from_type=<T>, to_type=<T>, label~="<substring>")
path_exists(from_type=<T>, to_type=<T>)
no_connection(from_type=<T>, to_type=<T>)
no_component(type=<ComponentType>)
group_exists(member_type=<ComponentType>)
no_reference_issues()
flag_present(kind=contradiction|underspecified|unverifiable, severity=blocking|warning)
no_flag(severity=blocking|warning)
assumption_present(text~="<substring>")
component_count(lte=<int>)
```

`app.eval.predicates.parse` validates the function, arguments, operators and
enum values. It deliberately does **not** evaluate a predicate against an
architecture. Evaluation is step 3.

`path_exists(from_type=<T>, to_type=<T>)` means: the graph contains a directed
chain of connections, of either type, from some component of the first type to
some component of the second type, through any number of intermediate
components. Direct-edge `connection_exists` items stay direct: they never match
a chain.

Anything the grammar cannot express is a `human` item. Human items are scored
by the product owner only. There is no LLM judge.

## Run protocol

- Each prompt is run **3 times per model**.
- Temperature, `max_tokens`, system prompt and schema are **identical across
  models and across runs**. Step 3 chooses those values and records them
  **before the first scored run**. They are never changed per model.
- `response_mode` (`json_schema` or `schema_in_prompt`) is a transport
  capability, so it **may differ per model**. It is recorded per model in
  `eval/freeze.json` and reported per model. No other setting may differ.
- A **run** passes the deterministic gate when:
  - every deterministic `must_include` item holds;
  - no deterministic `must_not_include` item is violated;
  - the `blocking_flag_expected` rule is met.
- A **prompt** passes when at least **2 of 3** runs pass the deterministic gate
  **and** the human items are satisfied on the first run that passed the gate.
- `blocking_flag_expected`:
  - `required` — the prompt fails if no blocking flag is present.
  - `forbidden` — the prompt fails if a blocking flag is present.
  - `optional` — recorded, not scored.

## Set-level bar

The set passes for a model only when **all** of these hold:

- at least **13 of 15** prompts pass;
- **all 4** complex prompts pass;
- **all 3** adversarial prompts pass;
- at least **41 of 45** runs are schema-valid on the first attempt.

Report raw counts beside every percentage, per model, never averaged across
models. The bar is fixed here, before generation code exists, and is never
adjusted after seeing results. A model that fails is reported as failed.

## Fixed settings and thresholds

`backend/app/eval/constants.py` is the only place these values live.
`eval/freeze.json` copies them, and `backend/tests/test_report.py` asserts the
block below matches the module. No report may invent or recompute a bar.

<!-- constants:begin -->
```json
{
  "RUNS_PER_PROMPT": 3,
  "GATE_RUNS_REQUIRED": 2,
  "TOTAL_PROMPTS": 15,
  "TOTAL_RUNS": 45,
  "MIN_PROMPTS_PASSED": 13,
  "TOTAL_COMPLEX": 4,
  "MIN_COMPLEX_PASSED": 4,
  "TOTAL_ADVERSARIAL": 3,
  "MIN_ADVERSARIAL_PASSED": 3,
  "MIN_FIRST_ATTEMPT_SCHEMA_VALID": 41,
  "TEMPERATURE": 0.3,
  "TIMEOUT_S": 120,
  "MAX_ATTEMPTS": 3,
  "TIMEOUT_RETRIES": 1,
  "MAX_RATE_LIMIT_WAITS": 5,
  "BACKOFF_SECONDS": [1, 2, 4, 8, 16]
}
```
<!-- constants:end -->

## Human scoring

- At most **3 human items per prompt**, scored by the product owner only.
- Every prompt includes the fixed standard human item: **"Every technology
  label names a real product that fits its component type."**
- `expected_requirements` is reference material for the human scorer. It is not
  machine-scored.
- `expected_assumptions` is likewise reference material for the human scorer. It
  is enforced only where a rubric item says so, which today is only `ev_14 r04`.
- A human `must_not_include` item is a violation the product owner can report;
  it is never inferred by an LLM.

### Human score file (step 3)

Human scores live at `runs/<model>/human_scores.json`:

```json
{"model": "<name>", "scores": {"ev_01": {"r07": "pass"}}}
```

- One entry per human rubric item of the **first gate-passing run** of each
  prompt.
- Values are `pass` or `fail`. The agent never writes this file.
- The report computes the verdict mechanically from it. If any required entry is
  missing or not `pass`/`fail`, the report prints **`HUMAN SCORING INCOMPLETE`**
  and no verdict.
- A prompt passes only when at least **2 of 3** runs pass the deterministic gate
  **and** every human item of the first gate-passing run is `pass`.

### Infrastructure failures

- `rate_limited` and `transport_error` are **infrastructure failures**, not
  model failures.
- They are excluded from every count, retried on the next invocation, and any
  model with such runs remaining is reported as **`INCOMPLETE`** with no
  verdict.
- A timeout is retried once per run. A second timeout ends the run as
  `timeout_failed`, which counts as a failed run and is not schema-valid on the
  first attempt.
- A model with fewer than 45 counted runs is also `INCOMPLETE`.

### Human sheet

`python -m app.eval.report` writes `runs/human_sheet.md` and
`runs/human_sheet_key.json`.

- The sheet shows, for each prompt's first gate-passing run: components (id,
  type, technology), connections (from, to, type, label), groups, flags and
  assumptions.
- The sheet never shows a model name. Labels are `Model A`, `Model B`, …
- The key file maps each label to its model name.

## Change control

- The set is frozen when step 2 is approved.
- `eval/CHANGELOG.md` records every change with its reason and the evidence
  that forced it.
- A prompt or rubric may be changed only because it was ambiguous, unfair, or
  mis-specified — never because a model scored badly on it.
- No prompt text may be edited after seeing model output.

### After a scored run

- Any change to the system prompt, the harness settings, or the evaluator after
  a scored run creates a **new version** in `eval/CHANGELOG.md`.
- A new version requires a **full rerun of every model**. Earlier results stay
  in the history; they are never overwritten or relabelled.
- A harness bug found after scoring is handled the same way: fix, bump the
  version, rerun all models.
- No change may reference a specific evaluation prompt. Tuning is allowed only
  on the scratch set, before the first scored run.
- `scored_run_approved` in `eval/freeze.json` is `false` until the product owner
  sets it to `true`. The agent must never set it.

## Frozen hash and step 3 handoff

**Status: frozen** on 12 November 2026, on step 2 approval.

```
SHA-256: 280E2E4145A2034BC73C213D59374BF94779666D3A25E407F5F60BB1F9C024DC
File:    eval/eval_set.json
Bytes:   55854
```

This is the SHA-256 of `eval/eval_set.json` as approved. The file must not change.
Any change requires a `eval/CHANGELOG.md` entry, a new version, and a new hash.

Step 3 must:

- recompute the hash before the first run and **refuse to run if it differs**;
- store the hash in every run record;
- store the temperature, `max_tokens`, system prompt and schema in every run
  record;
- count retries caused by the blocking-flag rule separately (see
  `docs/step-1-data-model.md` §12).

## Running the checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```

`test_eval_set.py` also re-serialises the validated set and asserts it matches
the file byte-for-byte.
