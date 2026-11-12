# Step 3 — Generation Harness

**Step prompt · v2 · 12 November 2026 · approved with changes**
**Source of truth:** project document v1.2 §5, §7, §8.7, §8.8, §10, §11; `docs/step-1-data-model.md` §11 and §12 (including §12.1); `eval/README.md` (frozen protocol and hash).

> v2 supersedes v1. Where v2 and v1 conflict, v2 wins. The first scored run is still **not allowed**.

---

## 1. Goal

Build the harness that turns a prompt into a schema-valid `ArchitectureDraft`, evaluates the frozen rubrics deterministically, ingests human scores, and computes the set verdict mechanically — without ever tuning the prompt, the rubrics or the bar to make a model look good.

This step ends with a harness that is frozen for approval. It does **not** run any `eval/eval_set.json` prompt. The first scored run happens only after you approve the frozen harness.

---

## 2. In scope

- An OpenAI-compatible chat client with configurable base URL, API key and model name.
- API keys only from the environment or a git-ignored `.env`; never committed, never logged, never written into a run record.
- A generation system prompt, versioned in the repo, generic across all prompts.
- Schema-validated generation with bounded retry and per-attempt telemetry, including the step-1 §12 blocking-flag-rule telemetry.
- A predicate evaluator for the complete grammar, including `path_exists`, `no_reference_issues()` (via `check_references()`) and the flag predicates.
- A runner that executes the frozen 3-run protocol, refuses to run on a hash mismatch or without approval, and records everything.
- A report generator that computes the set verdict mechanically from run records plus a human-score file, and prints `INCOMPLETE` / `HUMAN SCORING INCOMPLETE` instead of a verdict when evidence is missing.
- A scratch set and a scratch runner, used only to choose the response mode, `max_tokens` and system-prompt wording.
- A freeze file recording the settings, thresholds, measurements and approval state before the first scored run.

## 3. Out of scope

- Any run of the 15 evaluation prompts. Those run only after you approve the frozen harness.
- networkx validators, type-pairing matrix, graph semantics beyond the predicate grammar (step 4).
- Layout, coordinates, rendering (step 5).
- Any LLM judge. Human items stay human, scored only by you.
- Changing `eval/eval_set.json`. It is frozen; the runner refuses if its hash differs.
- Tuning the system prompt, rubric, or set bar after seeing scored results.
- Deployment, auth, rate limiting of our own service, clustering.

---

## 4. Inputs from earlier steps

- `schema/architecture.generation.schema.json` — the contract a model must satisfy.
- `backend/app/model/` — `ArchitectureDraft`, `check_references()`, `ComponentType`, `ConnectionType`, `FlagKind` (`contradiction`, `underspecified`, `unverifiable`), `Severity` (`blocking`, `warning`).
- `backend/app/eval/predicates.py` — `parse()`, `Predicate`, `COMPONENT_TYPE_LABELS`.
- `eval/eval_set.json` — frozen; SHA-256 `280E2E4145A2034BC73C213D59374BF94779666D3A25E407F5F60BB1F9C024DC`.
- `eval/README.md` — the run protocol, gate, set bar, human scoring rule, change control.
- `docs/step-1-data-model.md` §11, §12 and §12.1.
- `backend/tests/fixtures/small_architecture.json`, `full_coverage_architecture.json`.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  .gitignore                              # + .env, runs/, scratch/runs/
  .env.example                            # names only, no values
  prompts\system\architecture-v1.md       # the versioned generation system prompt
  scratch\scratch_prompts.json            # 5 non-eval prompts
  scratch\README.md                       # how scratch runs are made, never scored
  eval\freeze.json                        # thresholds, settings, measurements, approval flag
  backend\app\llm\
    __init__.py
    settings.py                           # env/.env config, redaction
    client.py                             # OpenAI-compatible client, stdlib urllib
    system_prompt.py                      # loads architecture-v1.md, exposes version + sha256
    generate.py                           # generate -> validate -> retry -> per-attempt telemetry
    scratch_runner.py                     # scratch runs only; cannot see eval_set.json
  backend\app\eval\
    constants.py                          # the one place thresholds and fixed settings live
    evaluate.py                           # predicate evaluator over ArchitectureDraft
    runner.py                             # frozen protocol, run records, resumability
    report.py                             # counts, verdict, human sheet
  backend\tests\
    test_llm_settings.py
    test_system_prompt.py
    test_generate.py
    test_evaluate.py
    test_runner.py
    test_report.py
    test_scratch_set.py
    fixtures\fake_llm\                     # canned model responses
  runs\                                   # git-ignored: run records, human scores, reports
```

`backend/pyproject.toml` gains `app.llm` in `[tool.setuptools] packages`. No new dependency: the HTTP transport is stdlib `urllib.request`, so the harness runs offline in the project venv.

### 5.0 Constants (`backend/app/eval/constants.py`)

Single source for the thresholds and fixed settings:

```
RUNS_PER_PROMPT = 3
GATE_RUNS_REQUIRED = 2
TOTAL_PROMPTS = 15
TOTAL_RUNS = 45
MIN_PROMPTS_PASSED = 13
TOTAL_COMPLEX = 4
MIN_COMPLEX_PASSED = 4
TOTAL_ADVERSARIAL = 3
MIN_ADVERSARIAL_PASSED = 3
MIN_FIRST_ATTEMPT_SCHEMA_VALID = 41
TEMPERATURE = 0.3
MAX_ATTEMPTS = 3
TIMEOUT_RETRIES = 1
MAX_RATE_LIMIT_WAITS = 5
BACKOFF_SECONDS = (1, 2, 4, 8, 16)
```

These values are copied into `eval/freeze.json` under `thresholds` and `shared_settings`. A test parses the machine-readable block in `eval/README.md` and asserts the constants match it. The bar is never recomputed anywhere else.

### 5.1 Settings (`settings.py`)

- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` from the environment, falling back to `D:\Paladin\.env` (`KEY=VALUE`, no interpolation).
- Missing key → `SettingsError` naming the variable and nothing else.
- `repr`, `str` and `to_record()` redact the key as `***`. The key never appears in an exception, a log line or a run record.
- `.env` is git-ignored; `.env.example` lists names only.

### 5.2 Client (`client.py`)

- `ChatClient.complete(messages, temperature, max_tokens, response_format, timeout_s) -> Completion`.
- `Completion(text, usage, latency_ms, finish_reason)`.
- One OpenAI-compatible `/chat/completions` POST. Base URL is configuration; no provider branching.
- Only `message.content` is read. `reasoning_content` and any other message field are ignored.
- Distinct exceptions: `RateLimitedError` (HTTP 429), `LLMTimeoutError`, `TransportError`.
- Optional `lister()` against `/models` for the scratch phase only.
- Never logs the `Authorization` header; request bodies only at DEBUG.

### 5.3 System prompt (`prompts/system/architecture-v1.md`)

Version `1.0`, loaded by `system_prompt.py`, exposing `SYSTEM_PROMPT_VERSION`, `SYSTEM_PROMPT_SHA256` and the text. Contents, and nothing else:

1. Emit one JSON object satisfying the supplied schema; no prose, no markdown fences.
2. The connection-type definitions **verbatim** from §12.1:
   - `sync` — the caller waits for the receiver to respond before continuing.
   - `async` — the caller does not wait for the receiver to process the work; handing work to a queue or event stream is `async`.
3. Flags, narrowly and generically:
   - `severity: blocking` — the stated requirements cannot all be satisfied together, or one of them is impossible. `resolved_by` must be `null`.
   - `severity: warning` — a requirement is vague, or an assumption was needed to proceed.
   - Kinds are the `FlagKind` values: `contradiction`, `underspecified`, `unverifiable`.
   - A flag never replaces the design; the design is still delivered.
   - A clean prompt must not produce a blocking flag.
4. Assumptions and traceability: every element has `assumed` plus either non-empty `requirement_refs` (when false) or a non-empty `rationale` (when true). Assumptions are stated, never hidden.
5. Grouping: one group per component, one level of nesting.
6. Component types copied from the enum, and the rule that `technology` is either a real product that fits the component type or `null`.

It must contain nothing specific to any evaluation prompt: no scenario, no domain, no trap, no rubric wording, no `technology~=` substring, no `ev_NN` id. Wording may be tuned **only** on scratch runs.

### 5.4 Generation (`generate.py`)

`generate(client, prompt_text, settings) -> GenerationResult`.

- Up to `MAX_ATTEMPTS = 3` schema attempts.
- Validation: `json.loads` (strict — a fenced response is a failure), then `jsonschema` against the generation schema, then `ArchitectureDraft.model_validate`.
- Retry message carries the schema errors only, never the expected design.
- Per attempt: index, outcome, error kind, redacted error text, latency, usage, `blocking_flag_rule_only`.
- `blocking_flag_rule_only` is true when the only validation error is the `severity: blocking` / `resolved_by` rule.
- Timeouts: retried **once per run**, not consuming a schema attempt. A second timeout ends the run as `timeout_failed`.
- Final status: `schema_valid`, `schema_invalid`, `timeout_failed`, `rate_limited`, `transport_error`.
- `first_attempt_schema_valid` is true only when attempt 1 validated.

### 5.5 Predicate evaluator (`evaluate.py`)

`evaluate(predicate, draft) -> bool`, plus `deterministic_gate(prompt, draft)` returning the failed item ids and the blocking-flag result. Semantics:

| Predicate | True when |
|---|---|
| `component_exists(type=T)` | at least one component has type `T` |
| `component_exists(type=T, technology~=S)` | such a component has non-null `technology` containing `S`, case-insensitive |
| `connection_exists(from_type=A, to_type=B, type=K)` | a connection of type `K` runs from a type-`A` to a type-`B` component |
| `connection_exists(..., label~=S)` | as above with `label` containing `S`, case-insensitive |
| `path_exists(from_type=A, to_type=B)` | a directed path of length ≥ 1 from a type-`A` to a type-`B` component, either connection type, any intermediates; a single edge qualifies |
| `no_connection(from_type=A, to_type=B)` | no direct connection of any type from `A` to `B` |
| `no_component(type=T)` | zero components of type `T` |
| `group_exists(member_type=T)` | a group lists a direct member of type `T` |
| `no_reference_issues()` | `check_references()` is empty |
| `flag_present(kind=K, severity=S)` | a flag has both |
| `no_flag(severity=S)` | zero flags of that severity |
| `assumption_present(text~=S)` | an assumption text contains `S`, case-insensitive |
| `component_count(lte=N)` | component count ≤ `N` |

`path_exists` is breadth-first with a visited set. Only `evaluate.py` is checked for a `networkx` import; no other module may import it either.

### 5.6 Runner (`runner.py`)

`python -m app.eval.runner --model <name> [--prompt ev_01] [--force] [--out runs]`.

Refusals before any call, each exiting non-zero and writing nothing:

1. `eval/eval_set.json` SHA-256 ≠ `freeze.json.eval_set_sha256` → print both hashes.
2. `freeze.json.scored_run_approved` is not `true` → "the harness is not approved for a scored run".
3. `freeze.json.max_tokens_measurements` is empty, or `max_tokens` < 2 × the largest measurement → "max_tokens is unmeasured or lacks 2x headroom".
4. The model is absent from `freeze.json.models` → no response mode is recorded for it.

Behaviour:

- 3 runs per prompt. Records at `runs/<model>/<prompt_id>/run-<n>.json`; architecture at `.../run-<n>.architecture.json`; per-model `index.json`.
- Settings and prompt hashes copied from `freeze.json`. Temperature and all settings except `response_mode` are identical across models; `response_mode` is per model.
- Resume: a terminal record is skipped unless `--force`. `rate_limited` and `transport_error` records are infrastructure failures — excluded from every count and retried on the next invocation.
- Rate limits: backoff `(1, 2, 4, 8, 16)` seconds, at most 5 waits, then record `rate_limited` and continue to the next run.
- Never reads `scratch/`.

Run record fields (all required):

```
run_id, model, base_url_host, eval_set_sha256, prompt_id, prompt_sha256,
system_prompt_version, system_prompt_sha256, settings{temperature, max_tokens,
timeout_s, response_mode, max_attempts}, run_index, started_at, finished_at,
attempts[{index, outcome, error_kind, error_text_redacted, latency_ms, usage,
          blocking_flag_rule_only}], final_status, first_attempt_schema_valid,
architecture_path, gate{passed, failed_items[], blocking_flag_rule}
```

### 5.7 Report (`report.py`)

`python -m app.eval.report --out runs` writes `runs/report.md` and prints the same text.

Per model, raw counts beside every percentage, never averaged across models:

- prompts passing the deterministic gate (2-of-3 runs), with failing ids;
- complex passing `n/4`; adversarial passing `n/3`; runs passing the gate `n/45`;
- schema-valid on the first attempt `n/45`, and first-attempt failures by kind;
- blocking flags: `required` flagged `n/2`; `forbidden` violations `n/12`; the `optional` prompt `skipped`;
- blocking-flag-rule-only retries and their outcome (§12);
- rate-limited and transport-error runs, counted separately and excluded from all counts above.

Human scores: `runs/<model>/human_scores.json`, one entry per human rubric item of the **first gate-passing run** of each prompt:

```json
{"model": "<name>", "scores": {"ev_01": {"r07": "pass"}}}
```

The agent never writes this file. The report ingests it and computes the verdict mechanically:

- a prompt passes when ≥2 of 3 runs pass the gate **and** every human item of the first gate-passing run is `pass`;
- the set passes only when all of: ≥13/15 prompts, 4/4 complex, 3/3 adversarial, ≥41/45 first-attempt schema-valid.

If any human score is missing → print `HUMAN SCORING INCOMPLETE` and no verdict. If a model has infrastructure runs remaining, or fewer than 45 counted runs → print `INCOMPLETE` for that model and no verdict for it.

Human sheet: for each prompt's first gate-passing run, a compact text rendering of the architecture — components (id, type, technology), connections (from, to, type, label), groups, flags, assumptions. The sheet never shows the model name; a separate `runs/human_sheet_key.json` maps sheet labels (`Model A`, `Model B`, …) to model names.

### 5.8 Scratch (`scratch/`)

- `scratch/scratch_prompts.json`: 5 prompts in domains that match none of the 15 eval slots — for example file sharing, IoT telemetry intake, room booking — with at least one contradictory and one vague. None paraphrases an eval prompt; a shingle test enforces this.
- `scratch/README.md`: scratch runs are for choosing response mode, `max_tokens` and system-prompt wording. They are never scored, never counted, and never read by the scored runner.
- `scratch_runner.py`: `python -m app.llm.scratch_runner --model <name> --mode json_schema|schema_in_prompt`, writes `scratch/runs/<model>/<mode>/<prompt>.json` with schema validity, latency and token usage. It reads only `scratch_prompts.json`.
- A live call to the provider's `/models` endpoint is allowed in this phase to list free models. The list is shown to you, with three proposals; you pick the models.

### 5.9 Freeze file (`eval/freeze.json`)

Created in this step, before any scored run, containing:

- `eval_set_sha256`;
- `system_prompt_version`, `system_prompt_sha256`;
- `thresholds` and `shared_settings` copied from `constants.py`;
- `max_tokens` and `max_tokens_measurements` (per scratch run: model, mode, prompt id, output tokens), with `max_tokens ≥ 2 × max(measurement)`;
- `reasoning_transform`: `null`, or one fixed documented transform (e.g. strip a leading `think` block) chosen on scratch runs, applied identically to every model;
- `models`: per model `{model_id, response_mode, notes}`;
- `scored_run_approved`: **false**. Only you change it to `true`. The agent must never set it.

---

## 6. Measurable acceptance criteria

1. `settings.py` reads the three variables; the key is `***` in `repr`, `str`, logs and records, proven by test.
2. `.gitignore` covers `.env`, `runs/`, `scratch/runs/`; `.env.example` has names only; `git check-ignore .env` succeeds.
3. `prompts/system/architecture-v1.md` has version `1.0`, the §12.1 definitions verbatim, the narrow severity rules, the technology rule, and no eval-specific content.
4. The system prompt contains no `technology~=` value, no eval prompt text, no 8-word shingle from an eval prompt, and no `ev_NN` id; the guard is proven non-vacuous by a planted-string test.
5. `generate.py` validates against schema and `ArchitectureDraft`, retries ≤2 times, records every attempt, classifies blocking-flag-rule-only violations, and retries a timeout once before failing the run.
6. `evaluate.py` implements all 12 functions per §5.5, including `path_exists` through intermediates, direction, cycles, and `check_references()`.
7. Only `evaluate.py` is checked for `networkx`; no module imports it.
8. `runner.py` refuses on a hash mismatch, writes no record, and prints both hashes.
9. `runner.py` refuses when `scored_run_approved` is false, proven by test; the shipped `freeze.json` has it false.
10. `runner.py` refuses when `max_tokens` is unmeasured or lacks 2× headroom.
11. `runner.py` writes 3 runs per prompt with every field in §5.6; settings identical across models except `response_mode`.
12. `rate_limited` and `transport_error` are excluded from all counts, retried on the next invocation, and make the model `INCOMPLETE` with no verdict.
13. A second timeout in a run yields `timeout_failed`, counted as a failed run and not schema-valid-first-attempt.
14. `report.py` computes the verdict only from constants, prints `INCOMPLETE` / `HUMAN SCORING INCOMPLETE` and no verdict when evidence is missing, and lists every human item for the first gate-passing run.
15. The human sheet renders components, connections, groups, flags and assumptions, and shows no model name; the key file maps labels to models.
16. A test proves the scored runner never opens `scratch/scratch_prompts.json`.
17. The constants match the machine-readable block in `eval/README.md`.
18. `python -m pytest -q` is green, including the 131 existing tests unchanged.

## 7. Tests

### `test_llm_settings.py`
1. Environment wins over `.env`. 2. `.env` used when the environment is empty. 3. Missing key raises `SettingsError` naming only the variable. 4. Key is `***` in `repr`, `str`, `to_record()`, and a captured log line. 5. `git check-ignore` reports `.env`, `runs/`, `scratch/runs/`.

### `test_system_prompt.py`
1. Loads, version `1.0`, sha256 is 64 hex. 2. §12.1 definitions verbatim. 3. Narrow severity rules and technology rule present. 4. No eval prompt text. 5. No 8-word shingle from an eval prompt. 6. No `technology~=` value; a planted string makes the guard fail. 7. No `ev_01`…`ev_15` id.

### `test_generate.py` (stub client)
1. Valid first response → `schema_valid`, 1 attempt. 2. Invalid then valid → attempt 2. 3. Three invalid → `schema_invalid`, 3 attempts. 4. Blocking-flag-rule-only sets the flag and counts as a retry. 5. HTTP 429 → `rate_limited`, not a schema failure. 6. One timeout then success → `schema_valid`; two timeouts → `timeout_failed` and `first_attempt_schema_valid` false. 7. Retry text carries errors, not design content. 8. Usage and latency recorded.

### `test_evaluate.py`
1. Every function true/false on fixtures. 2. `path_exists` through an intermediate, false in reverse. 3. Direct edge and async-only chain. 4. Cycle terminates. 5. `no_connection` chain vs direct edge. 6. `no_reference_issues()` false on a dangling connection. 7. `flag_present` matches kind and severity; `no_flag` severity only. 8. `group_exists` direct members only. 9. `~=` case-insensitive. 10. `component_count` inclusive. 11. Only `evaluate.py` is checked, and it has no `networkx` import.

### `test_runner.py` (stub client, temp dirs)
1. Hash mismatch → non-zero, both hashes, no record. 2. `scored_run_approved: false` → refused, no record. 3. Unmeasured `max_tokens` → refused. 4. 3 runs per prompt with all fields. 5. Settings identical across two models except `response_mode`. 6. Resume skips terminal and retries infrastructure records. 7. `--force` re-runs. 8. Rate-limit waits bounded. 9. `--prompt` restricts. 10. The scratch file is never opened.

### `test_report.py`
1. Per-model counts, never averaged. 2. 2-of-3 gate maths. 3. `n/45` from attempt 1 only. 4. Blocking `required` / `forbidden` / `optional`. 5. Infrastructure runs excluded and model `INCOMPLETE`. 6. Missing human score → `HUMAN SCORING INCOMPLETE`, no verdict. 7. Full human scores → verdict from constants; 13/15 passes, 12/15 fails; 4/4 and 3/3 and 41/45 each gate the verdict. 8. Human sheet has components, connections, groups, flags, assumptions, and no model name. 9. Key file maps labels. 10. Constants match the README block.

### `test_scratch_set.py`
1. Exactly 5 prompts, unique ids. 2. At least one contradictory and one vague. 3. No 8-word shingle shared with any eval prompt. 4. No prompt id or domain string matches an eval slot title keyword list. 5. The scored runner never reads the scratch file.

---

## 8. Edge cases and risks

- **Temperature 0.3 is fixed** for every model; three runs stay meaningfully independent.
- **`max_tokens` must be measured, not guessed.** The runner refuses an unmeasured value, so a forgotten scratch phase cannot slip into scoring.
- **Response mode is a transport capability**, so it may differ per model; every other setting is identical. Reporting it per model keeps that honest.
- **Reasoning in `content`.** Only `message.content` is used. If a model emits a `think` block inside content, at most one fixed documented transform is allowed, chosen on scratch runs, recorded, and applied identically. No other cleanup, ever.
- **Infrastructure failures are not model failures.** Excluding them and refusing a verdict is the only way a free tier stays interpretable.
- **A second timeout is a real failure**, not infrastructure: it is counted as a failed run.
- **Human scores are the bottleneck.** The file is one entry per human item per prompt; missing entries block the verdict rather than defaulting to pass.
- **Report gaming.** Thresholds live in one module and are copied into the freeze file; the report cannot invent a bar.
- **Key leakage** via exceptions, DEBUG logs or records; all three are tested.
- **Retry contamination**: retry text must never contain the rubric or the expected design.
- **Hash drift**: a stray edit to `eval_set.json` stops the runner.
- **Premature scored runs**: the approval flag is false and only you change it.
- **Scratch leakage into scoring**: the scored runner must never open the scratch file, proven by test.

---

## 9. Decisions

Fixed by v2: temperature `0.3`; `max_tokens` measured with 2× headroom; `timeout_s = 120`; `max_attempts = 3`; `TIMEOUT_RETRIES = 1`; response mode per model, chosen on scratch runs.

Still yours:

1. **Models.** I list free models from the provider's `/models` endpoint and propose three (GLM Flash plus two from different families). You pick.
2. **Response mode per model.** I test both modes on the scratch set and recommend one per model; you confirm.
3. **`max_tokens`.** I propose a value from the measurements with 2× headroom; you confirm.
4. **Reasoning transform.** If a model puts reasoning in `content`, I propose at most one fixed transform, or none; you confirm.

---

## 10. Report format

Per acceptance criterion: pass or fail with real evidence. Then:

- full `python -m pytest -v` output;
- the exact text of `prompts/system/architecture-v1.md`;
- the contents of `eval/freeze.json`;
- the scratch results table (model, mode, schema-valid rate, tokens);
- the model list from the provider and my proposed three;
- a dry-run report showing both `INCOMPLETE` and `HUMAN SCORING INCOMPLETE` outputs;
- a demonstration that a tampered `eval_set.json` is refused, with both hashes;
- files created or changed;
- any deviation stated plainly.

No scored result will be reported, because none will exist.

## 11. Stop condition

I update this prompt to v2, build only the paths in §5, run the offline tests, report with real evidence, commit and push. I do not run any `eval/eval_set.json` prompt, do not set `scored_run_approved`, do not record a scored result, and do not start step 4.

Then I stop and wait for **approved** on the frozen harness. After that approval, and only then, the first scored run may start.
