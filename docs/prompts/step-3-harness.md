# Step 3 — Generation Harness

**Step prompt · v1 · 12 November 2026 · draft for review**
**Source of truth:** project document v1.2 §5, §7, §8.7, §8.8, §10, §11; `docs/step-1-data-model.md` §11 and §12 (including §12.1); `eval/README.md` (frozen protocol and hash).

---

## 1. Goal

Build the harness that turns a prompt into a schema-valid `ArchitectureDraft`, evaluates the frozen rubrics deterministically, and reports raw counts — without ever tuning the prompt, the rubrics or the bar to make a model look good.

This step ends with a frozen harness and a frozen system prompt. It does **not** run the evaluation prompts. The first scored run happens only after you approve the frozen harness.

---

## 2. In scope

- An OpenAI-compatible chat client with configurable base URL, API key and model name.
- API keys only from the environment or a git-ignored `.env`; never committed, never logged, never written into a run record.
- A generation system prompt, versioned in the repo, generic across all prompts.
- Schema-validated generation with bounded retry and per-attempt telemetry, including the step-1 §12 blocking-flag-rule telemetry.
- A predicate evaluator for the complete grammar, including `path_exists`, `no_reference_issues()` (via `check_references()`) and the flag predicates.
- A runner that executes the frozen 3-run protocol, refuses to run on a hash mismatch, and records everything.
- A report generator with per-model counts, gate results, schema-valid-first-attempt counts, blocking-flag results in both directions, and a human-scoring sheet.
- A freeze file that records the settings and the system prompt before the first scored run, and a guard that refuses a scored run until you approve it.

## 3. Out of scope

- Any scored run of the 15 evaluation prompts. Those run only after you approve the frozen harness.
- networkx validators, type-pairing matrix, graph semantics beyond the predicate grammar (step 4).
- Layout, coordinates, rendering (step 5).
- Any LLM judge. Human items stay human.
- Changing `eval/eval_set.json`. It is frozen; the runner refuses if its hash differs.
- Tuning the system prompt, rubric, or set bar after seeing scored results.
- Deployment, auth, rate limiting of our own service, clustering.

---

## 4. Inputs from earlier steps

- `schema/architecture.generation.schema.json` — the contract a model must satisfy.
- `backend/app/model/` — `ArchitectureDraft`, `Architecture`, `check_references()`, `ComponentType`, `ConnectionType`, `FlagKind`, `Severity`, `RequirementKind`.
- `backend/app/eval/predicates.py` — `parse()`, `Predicate`, `COMPONENT_TYPE_LABELS`.
- `eval/eval_set.json` — frozen; SHA-256 `280E2E4145A2034BC73C213D59374BF94779666D3A25E407F5F60BB1F9C024DC`.
- `eval/README.md` — the run protocol, gate, set bar, human scoring rule, change control.
- `docs/step-1-data-model.md` §11 (blocking flags are metadata, scored both ways) and §12 / §12.1 (retry telemetry, connection-type definitions).
- `backend/tests/fixtures/small_architecture.json` and `full_coverage_architecture.json` — evaluator test inputs.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  .gitignore                              # + .env, runs/, *.key
  .env.example                            # names only, no values
  prompts\
    system\
      architecture-v1.md                  # the versioned generation system prompt
  eval\
    freeze.json                           # settings + prompt + hash, created before the first scored run
  backend\app\llm\
    __init__.py
    settings.py                           # env/.env config, redaction
    client.py                             # OpenAI-compatible chat client
    system_prompt.py                      # loads architecture-v1.md, exposes version + sha256
    generate.py                           # generate -> validate -> retry -> per-attempt telemetry
  backend\app\eval\
    evaluate.py                           # predicate evaluator over ArchitectureDraft
    runner.py                             # frozen protocol, run records, resumability
    report.py                             # per-model report + human-scoring sheet
  backend\tests\
    test_llm_settings.py
    test_system_prompt.py
    test_generate.py
    test_evaluate.py
    test_runner.py
    test_report.py
    fixtures\fake_llm\                     # canned model responses for offline tests
  runs\                                   # git-ignored output: run records and reports
```

`backend/pyproject.toml` gains `app.llm` in `[tool.setuptools] packages` and `httpx` in dependencies. Nothing else changes.

### 5.1 Settings (`settings.py`)

- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` read from the process environment, falling back to `D:\Paladin\.env` (simple `KEY=VALUE`, no interpolation).
- Missing key → a typed `SettingsError` with a message that names the variable and nothing else.
- `Settings.__repr__`, `__str__` and any `to_record()` output redact the key as `***`. The key never appears in an exception, a log line, or a run record.
- `.env` is git-ignored; `.env.example` lists variable names only.

### 5.2 Client (`client.py`)

- `ChatClient.complete(messages, temperature, max_tokens, response_format, timeout) -> Completion`.
- `Completion` carries `text`, `usage`, `latency_ms`, `finish_reason`.
- One OpenAI-compatible `/chat/completions` call. Base URL is configuration, not code; no provider-specific branching.
- Transport errors, timeouts and HTTP 429 are surfaced as distinct exception types (`TransportError`, `TimeoutError`, `RateLimitedError`). HTTP 429 is never counted as a schema failure.
- The client never logs the request body at INFO; at DEBUG it logs the prompt and the response, never the `Authorization` header.

### 5.3 System prompt (`prompts/system/architecture-v1.md`)

Version `1.0`, loaded by `system_prompt.py`, which exposes `SYSTEM_PROMPT_VERSION`, `SYSTEM_PROMPT_SHA256` and the text. It must contain, and only contain:

1. The task: emit one JSON object that satisfies the provided schema, with no prose and no markdown fences.
2. The connection-type definitions **verbatim** from `docs/step-1-data-model.md` §12.1:
   - `sync` — the caller waits for the receiver to respond before continuing.
   - `async` — the caller does not wait for the receiver to process the work; handing work to a queue or event stream is `async`.
3. The flag mechanism, generically: contradictory, underspecified or impossible requirements are surfaced as flags; the design is still delivered; `severity: blocking` requires `resolved_by: null`; a flag is metadata, not a substitute for a design.
4. Assumptions and traceability: every element has `assumed` and either non-empty `requirement_refs` (when false) or a non-empty `rationale` (when true); assumptions must be stated, never hidden.
5. Grouping: a component belongs to at most one group; group nesting is one level.
6. The component-type list, copied from the enum, with no technology product names.

It must contain nothing specific to any evaluation prompt: no scenario, no domain, no trap, no rubric wording, no `technology~=` substring.

### 5.4 Generation (`generate.py`)

`generate(client, prompt_text, settings) -> GenerationResult`, where the result carries every attempt and a final status.

- Attempt 1, then up to `MAX_RETRIES = 2` retries, for `MAX_ATTEMPTS = 3`.
- Validation is two-stage: `jsonschema` against the generation schema, then `ArchitectureDraft.model_validate`.
- On failure, the retry message contains the schema errors only — never the expected design.
- Per attempt, record: index, outcome, error kind, redacted error text, latency, token usage, and `blocking_flag_rule_only` (true when the only violation was `severity: blocking` with a non-null `resolved_by`).
- Final status is one of `schema_valid`, `schema_invalid`, `rate_limited`, `transport_error`, `timeout`.

### 5.5 Predicate evaluator (`evaluate.py`)

`evaluate(predicate: Predicate, draft: ArchitectureDraft) -> bool`. Semantics, fixed here:

| Predicate | True when |
|---|---|
| `component_exists(type=T)` | at least one component has type `T` |
| `component_exists(type=T, technology~=S)` | such a component has non-null `technology` containing `S`, case-insensitive |
| `connection_exists(from_type=A, to_type=B, type=K)` | a connection of type `K` runs from a type-`A` component to a type-`B` component |
| `connection_exists(..., label~=S)` | as above, with `label` containing `S` case-insensitive (plus `type` if also given) |
| `path_exists(from_type=A, to_type=B)` | a directed path of length ≥ 1 exists from a type-`A` component to a type-`B` component, traversing connections of either type through any intermediate components; a single edge qualifies |
| `no_connection(from_type=A, to_type=B)` | no direct connection of any type from a type-`A` to a type-`B` component |
| `no_component(type=T)` | zero components of type `T` |
| `group_exists(member_type=T)` | some group lists a member component of type `T` (direct members only) |
| `no_reference_issues()` | `check_references()` returns an empty list |
| `flag_present(kind=K, severity=S)` | at least one flag has that kind and severity |
| `no_flag(severity=S)` | zero flags have that severity |
| `assumption_present(text~=S)` | an assumption's text contains `S`, case-insensitive |
| `component_count(lte=N)` | the component count is ≤ `N` |

`path_exists` is breadth-first over the component adjacency list; it must not recurse without a visited set. No `networkx` import anywhere in `app/`.

### 5.6 Runner (`runner.py`)

`python -m app.eval.runner --model <name> [--prompt ev_01] [--force] [--out runs]`.

- Before any call: recompute `eval/eval_set.json`'s SHA-256 and compare with `eval/freeze.json`. On mismatch, exit non-zero with the two hashes and write nothing.
- Before any call: require `eval/freeze.json` `"scored_run_approved": true`. Otherwise exit non-zero with "the harness is not approved for a scored run".
- For each prompt, 3 runs. One `runs/<model_slug>/<prompt_id>/run-<n>.json` per run, plus `runs/<model_slug>/index.json`.
- Settings, system prompt version and system prompt hash come from `freeze.json` and are copied into every run record. There is no per-model override.
- Resumable: a run record that already exists with a terminal status is skipped unless `--force`. A `rate_limited` or `transport_error` record is retried on the next invocation without `--force`.
- Rate-limit handling: exponential backoff (1 s, 2 s, 4 s, 8 s, capped at 60 s, max 5 waits), then record `rate_limited` and continue to the next run rather than aborting the model.

Run record fields (all required):

```
run_id, model, base_url_host, eval_set_sha256, prompt_id, prompt_sha256,
system_prompt_version, system_prompt_sha256, settings{temperature, max_tokens,
timeout_s, response_mode, max_attempts}, run_index, started_at, finished_at,
attempts[{index, outcome, error_kind, error_text_redacted, latency_ms, usage,
          blocking_flag_rule_only}], final_status, first_attempt_schema_valid,
architecture_path, gate{passed, failed_items[], blocking_flag_rule}
```

`gate.blocking_flag_rule` is `pass`, `fail` or `skipped` (for `optional` prompts).

### 5.7 Report (`report.py`)

`python -m app.eval.report --out runs` writes `runs/report.md` and prints the same text.

Per model, raw counts beside every percentage, never averaged across models:

- prompts passing the deterministic gate: `n/15` (2-of-3 runs), with the failing prompt ids;
- complex prompts passing: `n/4`; adversarial prompts passing: `n/3`;
- runs passing the gate: `n/45`;
- schema-valid on the first attempt: `n/45`;
- first-attempt schema failures by kind;
- blocking flags: for the 2 `required` prompts, flagged `n/2`; for the 12 `forbidden` prompts, violations `n/12`; the `optional` prompt recorded as `skipped`;
- retries whose only cause was the blocking-flag rule, and their outcome (step-1 §12);
- rate-limited and transport-error runs, counted separately from schema failures.

Then the human-scoring sheet: for every prompt, the id of the first run that passed the gate, and every human item (`must_include` and `must_not_include`) with a blank `pass / fail` box, beside `expected_requirements` and `expected_assumptions` as reference. No human item is ever scored by code or by a model.

---

## 6. Measurable acceptance criteria

1. `backend/app/llm/settings.py` reads `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`; the key is redacted in `repr`, `str`, logs and run records, proven by test.
2. `.gitignore` contains `.env` and `runs/`; `.env.example` contains names only; `git check-ignore .env` succeeds.
3. `prompts/system/architecture-v1.md` exists with version `1.0`; it contains the §12.1 definitions verbatim and the generic flag, assumption, traceability and grouping rules.
4. The system prompt contains no `technology~=` value from the eval set and no eval prompt text; the guard is proven non-vacuous by a planted-string test.
5. `generate.py` validates against the generation schema **and** `ArchitectureDraft`, retries at most 2 times, records every attempt, and classifies blocking-flag-rule-only violations separately.
6. `evaluate.py` implements all 12 grammar functions with the semantics in §5.5, including `path_exists` through intermediates and in the correct direction.
7. `evaluate.py` calls `check_references()` for `no_reference_issues()`; no `networkx` import exists in `app/`.
8. `runner.py` refuses on an eval-set hash mismatch, writing no run record, proven by test.
9. `runner.py` refuses a scored run unless `eval/freeze.json` has `"scored_run_approved": true`.
10. `runner.py` writes 3 runs per prompt and every run record contains all fields in §5.6.
11. `runner.py` is resumable: existing terminal records are skipped; `rate_limited` records are retried; `--force` re-runs.
12. `report.py` emits per-model raw counts, gate results, `n/45` schema-valid-first-attempt, both-direction blocking results, and a human sheet listing every human item for the first gate-passing run of each prompt.
13. `eval/freeze.json` records `eval_set_sha256`, system prompt version and hash, and `{temperature, max_tokens, timeout_s, response_mode, max_attempts}`, and is created before the first scored run.
14. `python -m pytest -q` is green with the project venv, including the 131 existing tests unchanged.

## 7. Tests

### `test_llm_settings.py`
1. Environment variables win over `.env`.
2. `.env` is used when the environment is empty.
3. A missing key raises `SettingsError` naming only the variable.
4. The key is `***` in `repr`, `str`, `to_record()` and in a captured log line.
5. `git check-ignore` reports `.env` and `runs/`.

### `test_system_prompt.py`
1. The file loads, version is `1.0`, and the SHA-256 is 64 hex characters.
2. It contains the two §12.1 connection-type definitions verbatim.
3. It contains the generic flag, assumption, traceability and grouping rules.
4. No eval prompt text appears.
5. No 8-word shingle from any eval prompt appears (paraphrase guard).
6. No `technology~=` value appears; a planted `technology~=` string makes the guard fail, proving the guard works.
7. It names no evaluation prompt id (`ev_01` … `ev_15`).

### `test_generate.py` (stub client, no network)
1. A valid first response yields `schema_valid`, one attempt, `first_attempt_schema_valid`.
2. Invalid then valid yields `schema_valid` on attempt 2.
3. Three invalid attempts yield `schema_invalid`, 3 attempts, no architecture.
4. A blocking-flag-rule-only violation sets `blocking_flag_rule_only` and is counted as a retry.
5. HTTP 429 yields `rate_limited` and is not counted as a schema failure.
6. A timeout yields `timeout`; a transport error yields `transport_error`.
7. The retry message contains schema errors but not any expected design content.
8. Usage and latency are recorded per attempt.

### `test_evaluate.py`
1. Every function is true on `full_coverage_architecture.json` where the fixture supports it, and false on a negative variant.
2. `path_exists` is true through an intermediate component and false in the reverse direction.
3. `path_exists` accepts a direct edge and an async-only chain.
4. `path_exists` terminates on a cycle.
5. `no_connection` is true for a chain with no direct edge, and false for a direct edge.
6. `no_reference_issues()` is false when a connection points at a missing component.
7. `flag_present` matches kind and severity together; `no_flag` matches severity only.
8. `group_exists` matches direct members; a member in a child group does not count for the parent.
9. `technology~=` and `label~=` and `text~=` are case-insensitive.
10. `component_count(lte=N)` is inclusive at the boundary.
11. No module in `app/` imports `networkx`.

### `test_runner.py` (stub client, temp dirs)
1. A hash mismatch exits non-zero, prints both hashes, writes no record.
2. `scored_run_approved: false` exits non-zero and writes no record.
3. 3 runs per prompt are written with all §5.6 fields.
4. Every run record carries the same settings and system prompt hash across two models.
5. Resume skips terminal records and retries `rate_limited` ones.
6. `--force` re-runs.
7. A rate-limit wait sequence is bounded and recorded.
8. `--prompt ev_01` restricts the run to one prompt.

### `test_report.py`
1. Counts and percentages are per model and never averaged.
2. Gate maths: 2 of 3 passes a prompt; 1 of 3 does not.
3. `n/45` first-attempt schema-valid is computed from attempt 1 only.
4. Blocking results are reported for `required` and `forbidden` separately; `optional` is `skipped`.
5. The human sheet lists every human item for the first gate-passing run, and names no run for a prompt with no gate-passing run.
6. Rate-limit and transport counts are separate from schema-invalid counts.

---

## 8. Edge cases and risks

- **Temperature 0 collapses the 3-run protocol.** At 0.0 the three runs may be identical, so "2 of 3" becomes "1 of 1". This is why temperature is a decision below, not a default.
- **`path_exists` through a cycle.** A visited set is mandatory; a naive recursion hangs the evaluator.
- **`path_exists` is weaker than a direct edge.** That is deliberate (it allows a gateway). The direct "must not connect directly" items stay `connection_exists`/`no_connection`.
- **Providers that ignore `response_format`.** Markdown fences and prose appear around the JSON. The harness must not strip them silently: a fenced response is a schema failure, because the contract is JSON only.
- **Truncation at `max_tokens`.** A truncated JSON object is a schema failure, not a retry-with-more-tokens; the setting is frozen.
- **Free-tier rate limits.** 45 runs per model will hit them. Backoff, separate error kinds and resumability are requirements, not niceties.
- **Key leakage.** The most likely leak paths are exception messages, DEBUG logs and run records; all three are tested.
- **Retry contamination.** A retry message must never contain the rubric or the expected design, or the harness becomes a hint channel.
- **Hash drift.** `eval_set.json` is frozen; a stray edit must stop the runner, not be silently scored.
- **Premature scored runs.** The approval guard exists because the temptation to "just check one prompt" is exactly how a set gets tuned.
- **Report gaming.** Counts are raw; no metric is recomputed from another, and the bar is not printed as a pass/fail verdict that could be renegotiated.

---

## 9. Decisions needing confirmation

1. **Models for the first scored run.** Recommendation: GLM Flash as the primary, plus two alternates from different families so failures are not correlated — Qwen and Llama (or Gemma) free tiers. Exact model IDs will be confirmed against the provider's model list and recorded in `freeze.json` before the first scored run; no ID is guessed in code.
2. **Temperature.** Recommendation: **0.3**. It keeps three runs meaningfully independent while staying close to deterministic. Alternative: 0.0 for maximum reproducibility, accepting that 2-of-3 may degenerate to 1-of-1. Whichever you choose is recorded once and never changed per model.
3. **Response mode.** Recommendation: implement both `json_schema` (strict) and schema-in-prompt, test both on scratch prompts only, then choose one and record it in `freeze.json`. My expectation is that strict mode is better where supported, with schema-in-prompt as the fallback for providers that ignore `response_format` — but this is decided by evidence on scratch prompts, not now.
4. **Live scratch calls during step 3.** Recommendation: allow **one** scratch prompt per chosen model, outside the eval set, to prove connectivity and the response mode. Nothing scored, nothing from `eval_set.json`. If you prefer zero live calls in step 3, the client is verified only against a stub and the first live call happens after harness approval.

Also fixed unless you object: `max_tokens = 8000`, `timeout_s = 120`, `max_attempts = 3` (1 + 2 retries), `response_mode` per decision 3.

---

## 10. Report format

Per acceptance criterion: pass or fail with real evidence. Then:

- full `python -m pytest -v` output;
- the exact text of `prompts/system/architecture-v1.md` printed in full;
- the contents of `eval/freeze.json`;
- a transcript of an offline dry run on a **scratch** prompt showing a written run record and the generated report;
- a demonstration that a tampered `eval_set.json` is refused, with the two hashes printed;
- files created or changed;
- any deviation stated plainly.

I will not report any scored result, because none will exist.

## 11. Stop condition

I build only the paths in §5, run the offline tests, report with real evidence, commit and push. I do not run the evaluation prompts, do not record a scored result, do not start step 4, and do not change the frozen eval set.

Then I stop and wait for **approved** on this draft. After that approval I build step 3, and the first scored run still waits for a separate approval of the frozen harness and system prompt.
