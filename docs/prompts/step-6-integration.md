# Step 6 — Local Generation Integration

**Step prompt · v2 · 19 November 2026 · approved with changes; build gated**
**Source of truth:** project document v1.2 §4.1–§4.3, §6.8, §8.9; `README.md` “Principles”; `docs/prompts/step-3-harness.md` §5.1–§5.6 and §7; `docs/prompts/step-4-validators.md` §5.1 and §6.5; `docs/prompts/step-5-layout-render.md` §5.1–§5.6 and §7.

> v2 is the review contract. It records the seven approved changes on top of v1. No code is written, no model or provider is called, and no scored run is made by this prompt. `scored_run_approved` stays `false`. The one approved live smoke test (§10) is a post-gate action, not part of this build. The build starts only after the evaluation gate has selected a model **and** the user has approved a build.

### Changes from v1

1. **MAX_RUN_SECONDS is derived, not hardcoded.** `MAX_RUN_SECONDS = MAX_ATTEMPTS × (TIMEOUT_RETRIES + 1) × TIMEOUT_S + RUN_MARGIN_S`. Today's freeze gives `3 × (1 + 1) × 240 + 60 = 1440 + 60 = 1500 seconds (25 minutes)`. `RUN_MARGIN_S = 60` is a stated fixed margin covering validation, layout, watchdog, and polling overhead. The literal `900` is removed everywhere.
2. **No fake-LLM environment switch.** Tests inject a deterministic fake client through FastAPI dependency overrides (or constructor injection). There is no `PALADIN_FAKE_LLM`, no fake module in production code, and no environment-based provider branch.
3. **Source-scan test rewritten in place.** `frontend/src/test/dependencies.test.ts` is rewritten, not deleted: network calls are allowed only in `frontend/src/api/client.ts`, and only to the configured local backend origin. Every step-5 ban is retained, including no `validate_graph` and no keys in the frontend. The redundant `api-boundary.test.ts` from v1 is dropped.
4. **Vite binds to loopback.** The dev (`127.0.0.1:5173`) and preview (`127.0.0.1:4173`) servers are pinned in `frontend/vite.config.ts` so the browser origin matches the CORS allowlist. CORS is tested for both allowed origins and one disallowed origin.
5. **“No model selected” is explicit.** With no `freeze.json.selected_model` (or if the gate selected none), the uvicorn entry refuses to start (non-zero exit), `/api/health` reports `"no model selected"` with HTTP 503, and the run endpoints return HTTP 503 `no_model_selected`. No fallback model, no default, no environment override, no first-entry fallback, no UI picker — ever.
6. **Decisions resolved:** 1 = **A** (no disk log). 2 = **A** (one live smoke test after the gate, scratch prompt only, counted against the daily quota, stop on 429).
7. **Adding `selected_model` is invariant-safe.** A test proves that adding the field to a freeze copy changes no hashed or shared setting; the single added top-level key is the only difference.

### Review requirements retained from v1

1. One source of truth for generation: the endpoint calls the same `generate` function and the same `freeze.json` settings as the harness. It refuses to start when `freeze.json` has no selected model.
2. Validators report only. They never feed back into generation or retry.
3. The lock is released on success, failure, and timeout. A failed run shows the error, with HTTP 429 as its own message, and keeps the previous diagram untouched. There is no cancel button in this step.
4. Long runs: a progress state with elapsed time, and a server-side maximum run time.
5. The server binds to `127.0.0.1` only, CORS is limited to the local frontend origins, and the API key never reaches the browser, logs, or responses.
6. Tests: offline end-to-end with injected fake LLM fixtures for success, schema-invalid-then-valid, 429, timeout, and a malformed draft. No live call in the test suite.
7. Dependencies: exact versions, nothing published in the last 14 days, and the dependency audit reported.
8. Blocking flags: delivered with the diagram and shown prominently as “unresolved”, never hidden.
9. The two decisions are now resolved in §10.

---

## 1. Goal

Connect the proven halves of the pipeline into one local product flow:

```
user prompt
  -> frozen system prompt v1.1 + the selected model from freeze.json
  -> app.llm.generate.generate (the harness function, unchanged)
  -> ArchitectureDraft
  -> app.validation.validators.validate_graph (report only)
  -> draft + issues
  -> deterministic layout (step 5)
  -> read-only canvas + validator panel + flag panel
```

The user types a prompt, the canvas locks for the whole run, progress shows elapsed time, and the result is applied atomically. A failed or timed-out run leaves the previous diagram exactly as it was. Blocking flags are delivered with the diagram and shown prominently as unresolved. The whole run is bounded by a maximum time derived from the frozen retry/timeout settings, and generation uses one selected model with no fallback.

This step proves the integration only. It does not evaluate a model, does not use an eval prompt, and does not produce scored evidence.

---

## 2. In scope

- A local FastAPI application under `backend/app/api/`, bound to `127.0.0.1` only, with one worker and an in-memory run registry.
- Startup that loads `eval/freeze.json`, requires a selected model, verifies the frozen system-prompt hash, and refuses to start otherwise. In the no-model state, `/api/health` reports `"no model selected"` and run endpoints return 503.
- One shared generation-config builder used by both the harness runner and the endpoint, so there is one source of truth for temperature, token cap, timeout, attempts, response mode, reasoning, system prompt, and schema.
- A client dependency that can be overridden in tests by injection; production code has no fake path and no environment switch.
- `POST /api/runs` and `GET /api/runs/{run_id}` with the contract in §6.3.
- Generation through `app.llm.generate.generate` and validation through `app.validation.validators.validate_graph`.
- A server-side maximum run time derived from `freeze.json` (§6.4) and a progress state with elapsed time.
- A frontend prompt box, a running/progress state, a distinct 429 message, and lock release on every terminal state.
- Atomic apply: the previous diagram is replaced only after a successful run has produced a complete draft, validator issues, and a successful layout.
- A prominent “Unresolved blocking flag” panel, plus the existing side-panel flag list.
- Vite dev and preview servers bound to `127.0.0.1` so the browser origin matches the CORS allowlist.
- Offline tests with fake LLM fixtures injected through dependency overrides for success, schema-invalid-then-valid, 429, timeout, and a malformed draft.
- A test proving that adding `selected_model` to `freeze.json` changes no hashed or shared setting.
- A Python dependency-date check and a Python audit report, with exact versions.
- Step-6 screenshots captured offline from the injected fake client.

## 3. Out of scope

- Any scored run, eval prompt, rubric, human scoring, or `eval_set.json` read. The prompt comes from the user. The one post-gate smoke test uses a scratch prompt only (§10).
- Any change to `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`. These are read-only inputs.
- Prompt tuning, rubric changes, threshold changes, or validator-rule changes.
- Feeding validator issues back into generation, retry messages, or the system prompt.
- A cancel button, a run queue, concurrent runs, streaming tokens, or a chat transcript.
- Auth, users, sessions, rate limiting, deployment, containers, a cloud service, or a public bind.
- Persistence, a database, localStorage, prompt history, or export. Decision 1 = A means **no disk run log**.
- Editing the architecture, dragging nodes, or writing coordinates into a draft.
- A model picker in the UI, a default model, an environment override, or a first-entry fallback. The selected model is only the one `freeze.json` names.
- A live provider call in the test suite, a fake-LLM environment switch, or any fake/provider branch in production code.
- A second source-scan test (`api-boundary.test.ts` is dropped; the rewritten `dependencies.test.ts` is the single scan).
- Step 5 rework. The layout, canvas, fixtures, and screenshots stay as approved unless the user reports a visual issue.

---

## 4. Inputs from earlier steps

- `eval/freeze.json` — the single source of generation settings. At drafting time it carries `system_prompt_version "1.1"`, `system_prompt_sha256 21A2D1F1…D961`, `shared_settings` (`TEMPERATURE 0.3`, `TIMEOUT_S 240`, `MAX_ATTEMPTS 3`, `TIMEOUT_RETRIES 1`, `MAX_RATE_LIMIT_WAITS 5`, `BACKOFF_SECONDS [1,2,4,8,16]`), `max_tokens 32768`, `models`, `reasoning_transform null`, and `scored_run_approved false`.
- `freeze.json.selected_model` — **not present yet.** The evaluation gate writes this top-level string when it selects a model. Step 6 never writes `freeze.json`; it only reads the field. Absence is a startup refusal and a `"no model selected"` health state, not a default. Adding it must leave every hashed and shared setting untouched (§6.2, test in §8.1).
- Run-time derivation inputs from `freeze.json.shared_settings`: `MAX_ATTEMPTS = 3`, `TIMEOUT_RETRIES = 1`, `TIMEOUT_S = 240`, plus the stated `RUN_MARGIN_S = 60` (§6.4). No hardcoded run-time constant.
- `backend/app/llm/generate.py` — `generate(client, prompt_text, config, *, reasoning_transform=None)`, `GenerationConfig`, `GenerationResult`, and the statuses `schema_valid`, `schema_invalid`, `rate_limited`, `timeout_failed`, `truncated`, `transport_error`.
- `backend/app/llm/client.py` — `ChatClient`, `RateLimitedError`, `LLMTimeoutError`, `TransportError`, `TruncatedError`. Only `message.content` is read.
- `backend/app/llm/settings.py` — `load_model_settings(model_entry)`; `Settings`/`ChatClient` redact the key in `repr`, `str`, and `to_record`.
- `backend/app/llm/system_prompt.py` — `load_system_prompt()`, the frozen v1.1 prompt.
- `backend/app/validation/validators.py` — `validate_graph(draft, rules=None) -> list[Issue]`; deterministic order; never raises for a graph problem.
- `backend/app/validation/rules.py` — `load_rules()` and `rules_version "1.1"`.
- `backend/app/model/architecture.py` — `ArchitectureDraft`, `MAX_COMPONENTS 120`, `MAX_CONNECTIONS 300`.
- `backend/app/model/assumption.py` — `Flag` with `severity` of `blocking` or `warning`; a blocking flag has `resolved_by: null`.
- `backend/app/model/issues.py` — `Issue` with `kind`, `message`, `element_id`, `severity`.
- `schema/architecture.generation.schema.json` — frozen generation schema, SHA-256 `0033E0C195B72B0E822CD4DCA8A4C3EB418AEB22765A66F04E90448A760FC89F`.
- `frontend/src/layout/layout.ts` — `layoutArchitecture(draft)`; normalises soft-rule violations and returns `LayoutResult` with adjustment notes.
- `frontend/src/render/Canvas.tsx` — already accepts `locked`; no change is required.
- `frontend/src/render/SidePanel.tsx`, `IssuesPanel.tsx`, `AdjustmentsPanel.tsx` — existing read-only panels.
- `frontend/src/app/modes.ts` — `FixtureEntry`, `FixtureName`, theme and fixture parsing.
- Step 5 evidence — 55 frontend tests, 307 backend tests, nine 1600 × 1000 screenshots. Step 6 must not break them.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  backend\
    app\
      api\
        __init__.py
        __main__.py              # uvicorn entry, 127.0.0.1 only, startup guard refuses no-model
        main.py                  # FastAPI app, CORS, routes, lifespan, injectable client dependency
        models.py                # request/response Pydantic models
        runs.py                  # in-memory registry, one active run, max-time watchdog
        generation.py            # build config, call generate, call validate_graph
        config.py                # freeze loading, selected model, shared config builder, derived run time
      eval\
        runner.py                # edit only to call the shared config builder
    scripts\
      check-dependency-dates.py  # PyPI publish-date gate for direct Python dependencies
    tests\
      fixtures\api\
        fake_client.py           # test double only; implements the client interface used by generate
        success.json
        schema_invalid_then_valid.json
        malformed.json
      test_api_startup.py        # includes no-model health + 503 proofs
      test_api_runs.py
      test_api_offline.py        # injects fake_client.py via dependency overrides
      test_api_security.py       # CORS: both allowed origins + one disallowed
      test_freeze_invariant.py   # adding selected_model changes no hashed/shared setting
    pyproject.toml               # edit: add exact-pinned fastapi, uvicorn, httpx, pip-audit
  frontend\
    src\
      api\
        client.ts                # the only runtime module allowed to call the local backend
        types.ts                 # live run request/response types
      app\
        live.ts                  # live-run state machine and atomic apply
        modes.ts                 # edit: widen the entry type for a live result
      render\
        PromptBox.tsx
        RunStatus.tsx
        BlockingFlagsPanel.tsx
        SidePanel.tsx            # edit: accept a live entry
        styles.css               # edit: prompt, progress, error, blocking-flag styles
      test\
        prompt-run.test.tsx
        atomic-apply.test.tsx
        blocking-flags.test.tsx
        dependencies.test.ts     # REWRITE: network allowlist (client.ts + local origin only); all bans kept
      App.tsx                    # edit: prompt box, lock, progress, atomic apply
    vite.config.ts               # edit: bind dev 127.0.0.1:5173 and preview 127.0.0.1:4173
    README.md                    # edit: run the backend and frontend, submit a prompt
  docs\screenshots\step-6\
    prompt-idle.png
    run-running.png
    run-success-issues.png
    run-blocking-flag.png
    run-error-429.png
```

No other file changes. In particular:

- No change to `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`.
- No change to `backend/app/model/`, `backend/app/validation/`, `backend/app/llm/client.py`, `backend/app/llm/generate.py`, `backend/app/llm/settings.py`, or `backend/app/llm/system_prompt.py`.
- No fake-LLM module, environment switch, or provider branch in any production path. Fake code lives only under `backend/tests/`.
- `backend/app/eval/runner.py` changes only to call the shared config builder; its scored-run behaviour is unchanged.
- No change to `frontend/src/layout/`, `frontend/src/render/Canvas.tsx`, `IssuesPanel.tsx`, `AdjustmentsPanel.tsx`, `Legend.tsx`, or `theme.ts`.
- No `api-boundary.test.ts`: the rewritten `dependencies.test.ts` is the single source-scan test.
- No change to the nine step-5 screenshots or their tests.

---

## 6. Proposed design

### 6.1 Process topology

- FastAPI + uvicorn on `127.0.0.1:8000`, one worker, no reload in the run command.
- Vite dev server on `127.0.0.1:5173`; `vite preview` on `127.0.0.1:4173`. Both hosts are set explicitly in `frontend/vite.config.ts` (`server.host = "127.0.0.1"`, `preview.host = "127.0.0.1"`) so the browser origin is exactly one of the two CORS-allowed origins. `localhost` is not used as a bind or an allowed origin.
- The frontend calls the API directly at `http://127.0.0.1:8000`; no proxy is required.
- One active run at a time. The registry is in memory; restarting the server drops runs. Decision 1 = A: nothing is written to disk.

### 6.2 Freeze selection, no-model state, and the shared config builder

At startup, before serving:

1. Read `eval/freeze.json`.
2. Require `selected_model` to be a non-empty string and a key in `freeze["models"]`. If it is missing, empty, or unknown, raise a startup error that names the file and the field, prints no key material, and exits non-zero. No default model, no environment override, no first-entry fallback.
3. Require the loaded system prompt’s SHA-256 to equal `freeze["system_prompt_sha256"]`. A mismatch is a startup refusal.
4. Build the model settings with `load_model_settings(freeze["models"][selected_model])`; the key comes from the environment or the git-ignored `.env`.
5. Compute `MAX_RUN_SECONDS` from the freeze settings and the stated margin (§6.4).

No-model behaviour is explicit and testable in two layers:

- The uvicorn entry (`__main__.py`) runs the startup guard first. With no valid selected model it prints a refusal naming `freeze.json` and `selected_model` and exits non-zero; the server does not start serving generation.
- The FastAPI app object itself always defines `GET /api/health`. When built without a valid selected model (as in tests, or defensively at runtime), health returns HTTP **503** with `{"status": "unavailable", "model": "no model selected", "message": "freeze.json has no selected_model; no fallback model is used", ...}`. The literal string `"no model selected"` is the contract. Both `POST /api/runs` and `GET /api/runs/{run_id}` return HTTP **503** with `error.code = "no_model_selected"` in that state. No response names a different model.

The endpoint and the harness use one builder:

- Add `build_generation_config(freeze, model_entry, system_prompt, schema)` in `backend/app/api/config.py`.
- `backend/app/eval/runner.py` calls the same builder instead of assembling `GenerationConfig` inline.
- The builder reads only `freeze.json` and `app.eval.constants`:
  - `temperature = freeze["shared_settings"]["TEMPERATURE"]`;
  - `max_tokens = freeze["max_tokens"]`;
  - `timeout_s = freeze["shared_settings"]["TIMEOUT_S"]`;
  - `max_attempts = freeze["shared_settings"]["MAX_ATTEMPTS"]`;
  - `response_mode = model_entry["response_mode"]`;
  - `reasoning = model_entry.get("reasoning")`;
  - `system_prompt` from `load_system_prompt()`;
  - `schema` from the frozen generation schema.
- `reasoning_transform` is resolved from `freeze["reasoning_transform"]` and applied identically.
- The endpoint does **not** call `check_preconditions`: that gate requires `scored_run_approved: true` and the eval-set hash, and this endpoint is not a scored run. It performs only the generation-specific checks above.
- The endpoint never reads `eval/eval_set.json` and never accepts an eval prompt as a special case.

Invariant test (change 7): on a temporary copy of `freeze.json` with no `selected_model`, add one valid `selected_model` and assert that **every other** field is unchanged — `eval_set_sha256`, `system_prompt_sha256`, `thresholds`, `shared_settings`, `max_tokens`, `models`, `reasoning_transform`, `scored_run_approved`, and all remaining keys — so the only difference is the single new top-level key. Recompute the eval-set and system-prompt hashes and confirm they still match the unchanged hash fields. The committed `freeze.json` is never edited.

A test proves the endpoint’s config equals the config the harness builds for the same selected model, field for field.

### 6.3 API contract

`POST /api/runs`

```json
{ "prompt": "Design a URL shortener for 10k redirects per second." }
```

- `202 Accepted` with `{ "run_id": "...", "state": "running", "started_at": "...", "max_run_seconds": 1500 }`.
- `400` for an empty prompt, a non-string prompt, or a body over 16 KB.
- `409` with `{ "error": { "code": "run_in_progress", "message": "..." } }` when a run is already active.
- `503` with `error.code = "no_model_selected"` when no model is selected (defence in depth; the process should not be serving in that state).

`GET /api/runs/{run_id}`

```json
{
  "run_id": "...",
  "state": "running",
  "elapsed_ms": 41230,
  "max_run_seconds": 1500,
  "result": null,
  "error": null
}
```

- `state` is one of `queued`, `running`, `succeeded`, `failed`, `timeout`.
- On success, `result` is:

```json
{
  "draft": { "...": "the exact ArchitectureDraft JSON" },
  "issues": [
    {
      "kind": "invalid_type_pairing",
      "severity": "invalid",
      "element_id": "cnx_...",
      "message": "..."
    }
  ],
  "rules_version": "1.1"
}
```

- On failure or timeout, `error` is `{ "code": "...", "message": "..." }` and `result` is `null`.
- Error codes: `no_model_selected`, `rate_limited`, `provider_timeout`, `run_timeout`, `schema_invalid`, `truncated`, `transport_error`, `internal_error`, `connection_lost`.
- `404` for an unknown or evicted run.
- Every response is `Cache-Control: no-store`.
- No response contains the API key, the base URL, the raw provider payload, or the system prompt.

`GET /api/health`

Selected-model state (`200`):

```json
{ "status": "ok", "model": "<selected model name>", "system_prompt_version": "1.1", "rules_version": "1.1", "max_run_seconds": 1500 }
```

No-model state (`503`):

```json
{ "status": "unavailable", "model": "no model selected", "message": "freeze.json has no selected_model; no fallback model is used", "system_prompt_version": "1.1", "rules_version": "1.1", "max_run_seconds": 1500 }
```

The health response is the only place the selected model name is exposed. It is not a secret. In the no-model state the model field is exactly `"no model selected"`.

### 6.4 Run lifecycle and derived maximum time

- `POST` creates a run in `queued`, starts a worker thread, and returns immediately.
- The worker moves the run to `running`, calls generation, then validation, and writes the terminal state once.
- The registry holds at most 10 recent runs; the oldest terminal run is evicted first. Eviction is deterministic.
- `started_at` is monotonic. `elapsed_ms` is computed server-side on every `GET`; the frontend also ticks locally between polls.
- The maximum run time is **derived**, never hardcoded:

```
MAX_RUN_SECONDS = MAX_ATTEMPTS × (TIMEOUT_RETRIES + 1) × TIMEOUT_S + RUN_MARGIN_S
                = 3 × (1 + 1) × 240 + 60
                = 1440 + 60
                = 1500 seconds  (25 minutes)
```

  - `MAX_ATTEMPTS`, `TIMEOUT_RETRIES`, and `TIMEOUT_S` come from `freeze.json.shared_settings`. `3 × 2 × 240 = 1440 s` is the worst-case provider time: each of three attempts can use its full timeout plus `TIMEOUT_RETRIES` retries.
  - `RUN_MARGIN_S = 60` is a stated fixed margin for validation, layout, watchdog, and polling slack. It is a named constant in `backend/app/api/config.py`, documented in the health response and the report.
  - `MAX_RUN_SECONDS` is computed at startup and is not a request parameter. If freeze settings change, the number changes with them. The report prints the computed value. No hardcoded `900` is used as a value in code, config, the UI, or the API contract.
- A watchdog, or the `GET` handler, marks a run `timeout` when `elapsed_ms > MAX_RUN_SECONDS * 1000`. The terminal state is written once; any late worker result is discarded. The lock in the frontend is released by the terminal state.
- There is no cancel endpoint and no cancel button.
- A second `POST` while a run is active returns `409`; it does not queue.

### 6.5 Generation then validation

- Build the config once per run through the shared builder.
- Obtain the client from the injected dependency/factory (§6.9); in production it is the real `ChatClient`, in tests it is the injected fake.
- Call `generate(client, prompt, config, reasoning_transform=...)`.
- On `schema_valid`: call `validate_graph(draft, load_rules())` **exactly once**; return the draft, the issues, and `rules_version`.
- On `schema_invalid`: return `failed` with `schema_invalid` and the last redacted validation text (capped at 800 characters, as the harness does). No validator call.
- On `rate_limited`: return `failed` with `rate_limited`. No retry. The message says the free-model daily limit was reached and names the 00:00 UTC reset.
- On `timeout_failed`: return `failed` with `provider_timeout`.
- On `truncated`: return `failed` with `truncated`.
- On `transport_error`: return `failed` with `transport_error`.
- The validator output is returned beside the draft. It is never appended to a retry message, never placed in the system prompt, never used to decide another attempt, and never mutates the draft.
- The draft is serialised with `model_dump(mode="json")`; the endpoint does not normalise, repair, or drop anything.

### 6.6 Frontend flow

- `PromptBox` is a labelled textarea and a “Generate” button. Empty input is rejected locally. The box is disabled while a run is active.
- On submit: `POST /api/runs`, set `run = { id, state: "running", startedAt }`, lock the canvas (`locked = true`), start the local timer, and poll every 1000 ms.
- `RunStatus` shows the state, the elapsed time (`m:ss`), and the server maximum (`max 25:00`, derived from `max_run_seconds = 1500`). It uses an indeterminate bar, never a fake percentage.
- On `succeeded`: validate the payload shape; run `layoutArchitecture(result.draft)`; only if layout succeeds, commit the new live entry in one state update; unlock; stop polling; clear the selection.
- On `failed` or `timeout`: keep the committed entry (live or fixture) exactly as it was; show an error card with the code-specific message; unlock; stop polling; re-enable the prompt box.
- On a poll failure (server down, 404): treat it as `failed` with `connection_lost`; keep the previous diagram; unlock.
- A 429 is its own error card: “Free-model daily limit reached (HTTP 429). No retry was made. Try again after the daily reset at 00:00 UTC.” It is not shown as a generic failure.
- No cancel button is rendered.
- After a successful run, the toolbar’s fixture picker shows “Live run”; choosing a fixture discards the live entry (in memory only). The theme toggle remains available during a run; the fixture picker and fit button are disabled while locked.

### 6.7 Atomic apply

`App` keeps two values:

- `committed`: the last successfully applied entry (a fixture or a live result).
- `pending`: the active run.

Rules:

- The canvas renders `committed` only.
- A run never writes into `committed` while it is running.
- On success, layout is computed first. If layout throws, the run is treated as `failed` and `committed` is unchanged.
- The commit is one `setCommitted` call with the draft, the issues, and the layout result together. There is no intermediate render with a new draft and old issues, or vice versa.
- On failure or timeout, `pending` is cleared and `committed` is untouched.

### 6.8 Panels and flags

- The side panel lists requirements, assumptions, flags, layout adjustments, the legend, and validator issues, with counts that match the payload.
- A new `BlockingFlagsPanel` sits above the canvas. For every flag with `severity == "blocking"`, it shows:
  - the heading “Unresolved blocking flag”;
  - the flag description;
  - the requirement ids it references.
- The panel is always visible when a blocking flag exists. It is not dismissible, not collapsed, and not hidden behind a tab or a scroll region. It remains visible while the diagram renders.
- Warning flags are listed in the side panel and are not labelled “unresolved”.
- The validator panel shows every issue verbatim with `invalid` and `judgment` badges. It is read-only and has no control that changes the draft.
- The adjustments panel shows the layout normalisations for the live draft, exactly as it does for the broken fixture.

### 6.9 Security, locality, and test injection

- `uvicorn` binds to `127.0.0.1` only. No `0.0.0.0`, no host from an untrusted environment variable.
- CORS allowlist: `http://127.0.0.1:5173` and `http://127.0.0.1:4173`. No `*`, no credentials, no arbitrary origin reflection. The list is a constant; adding an origin is a code change. `http://localhost:5173` is not allowed.
- The API key is read only by the server through `load_model_settings`. It is never sent to the browser, never serialised, never logged, and never placed in an error message.
- The server logs request method, path, run id, state, and elapsed time only. It does not log headers, bodies, the settings object, or provider responses.
- Errors are fixed strings. A provider exception is mapped to a code; its raw text is not returned.
- The request body is capped at 16 KB.
- The frontend bundle contains no `LLM_API_KEY`, no provider URL, and no model SDK. The only network target is the loopback API, reached only through `frontend/src/api/client.ts` (§8.2).
- No auth, by design, because the bind and CORS keep it local.
- **Test injection (change 2):** the API obtains its client from an injectable dependency (`get_client_factory()` / `Depends`). Production builds the real `ChatClient`; tests override the dependency with `app.dependency_overrides` (or inject a `RunService` built with the fake) so the worker thread constructs the deterministic fake from `backend/tests/fixtures/api/fake_client.py`. The fake implements the same interface `generate` uses. Production code contains no fake implementation, no environment switch, and no branch that selects a client by name or env var.

### 6.10 Dependencies

Python (`backend/pyproject.toml`):

- Add `fastapi`, `uvicorn`, `httpx` (the FastAPI test client), and `pip-audit`, each pinned to an exact version.
- Do not upgrade `networkx`, `pydantic`, `pytest`, or `jsonschema`.
- `backend/scripts/check-dependency-dates.py` reads the direct dependencies and queries the PyPI JSON API. It prints every direct dependency with its exact version and upload date, and exits non-zero if any selected version was published less than 14 days ago.
- Run `pip-audit` and report the full summary. Findings are reported, never auto-fixed.
- The existing backend suite must still pass.

Frontend:

- No new runtime dependency. The client uses the built-in `fetch`.
- Tests stub `fetch` with `vi.stubGlobal`; no MSW or HTTP client is added.
- If a new dev dependency is unavoidable, it is exact-pinned, older than 14 days, and reported. The default is none.
- `npm audit` is reported again; findings are not auto-fixed.

---

## 7. Measurable acceptance criteria

1. `backend/app/api/` exists with the routes in §6.3; the server starts with `uvicorn` bound to `127.0.0.1` and exits non-zero when `freeze.json` has no `selected_model`.
2. Startup tests prove refusal for a missing, empty, or unknown `selected_model`, and for a system-prompt hash mismatch. In the no-model state `/api/health` returns 503 with `model: "no model selected"` and run endpoints return 503 `no_model_selected`. No default, env override, first-entry fallback, or UI picker exists.
3. The endpoint and the harness build identical `GenerationConfig` values for the selected model, proven by a test that compares every field.
4. The endpoint calls `app.llm.generate.generate`; it does not reimplement generation, retry, or parsing.
5. A successful run returns the exact `ArchitectureDraft`, the `validate_graph` issues, and `rules_version`.
6. `validate_graph` is called exactly once per successful run, and no issue text appears in any generation or retry message.
7. The canvas is locked from submit until a terminal state, and unlocked on success, failure, and timeout.
8. A failed or timed-out run leaves the previously committed diagram unchanged, and the error is shown.
9. HTTP 429 is shown as its own message; it is not retried.
10. The progress state shows elapsed time and the server maximum; `MAX_RUN_SECONDS = 1500` is derived as `3 × (1 + 1) × 240 + 60` from the freeze settings plus the stated margin, is enforced server-side, and produces `timeout`. No hardcoded `900` is used.
11. A second submit while a run is active returns `409` and does not start a second run.
12. Atomic apply: the committed entry changes once, only after a successful layout; there is no partial update.
13. Every blocking flag is shown in a prominent “Unresolved blocking flag” panel, not hidden; warning flags are not labelled unresolved.
14. The validator panel and flag panel render the live payload with correct counts, and the layout adjustments panel renders live normalisation notes.
15. The API key never appears in the browser bundle, any response, any log line, or any error message; a test scans for it.
16. CORS allows exactly `http://127.0.0.1:5173` and `http://127.0.0.1:4173` (both echoed with the matching allow header), while one disallowed origin such as `http://localhost:5173` gets no allow header.
17. Vite dev and preview bind to `127.0.0.1` (`127.0.0.1:5173` and `127.0.0.1:4173`), matching the CORS origins.
18. Offline tests cover success, schema-invalid-then-valid, 429, provider timeout, server run timeout, and a malformed draft via injected fakes; the suite runs with no `LLM_API_KEY`, makes no live call, and uses no environment switch or production fake path.
19. The malformed-draft case returns a draft plus non-empty issues and does not crash layout or render.
20. A test proves that adding `selected_model` to a freeze copy changes no hashed or shared setting: only that one top-level key differs, and recomputed hashes still match.
21. Every new Python dependency is exact-pinned, older than 14 days, and listed with its publish date; `pip-audit` and `npm audit` summaries are reported.
22. The existing 307 backend tests and 55 frontend tests still pass; the nine step-5 screenshots still regenerate.
23. No file under `eval/`, `prompts/system/`, `schema/`, or `eval/freeze.json` is modified; `scored_run_approved` remains `false`.
24. Five step-6 screenshots exist under `docs/screenshots/step-6/`, each 1600 × 1000, produced offline from the injected fake client.
25. The rewritten `frontend/src/test/dependencies.test.ts` allows network calls only in `frontend/src/api/client.ts` and only to the configured local backend origin, while retaining every other prohibition, including no `validate_graph` and no keys in the frontend. No `api-boundary.test.ts` is added.
26. Decisions 1 = A (no disk log) and 2 = A (one gated live smoke test) are recorded and honoured.
27. The changes are committed and pushed to `origin/main`.

---

## 8. Tests

### 8.1 Backend offline (`backend/tests/test_api_*.py`)

`test_api_startup.py`

1. Missing `selected_model` → startup error, non-zero exit, message names `freeze.json` and the field.
2. Empty `selected_model` → same.
3. `selected_model` not in `models` → same.
4. System-prompt hash mismatch → startup refusal.
5. Valid freeze → app starts; `GET /api/health` reports the selected model, version, rules version, and `max_run_seconds` equal to the derived `1500`.
6. No-model app object → `GET /api/health` returns 503 with `model: "no model selected"`; `POST /api/runs` and `GET /api/runs/{id}` return 503 `no_model_selected`; no other model name appears.

`test_freeze_invariant.py`

1. Start from a freeze copy with no `selected_model`; record a deep copy.
2. Add one valid `selected_model`; assert the only changed top-level key is `selected_model`.
3. Assert `eval_set_sha256`, `system_prompt_sha256`, `thresholds`, `shared_settings`, `max_tokens`, `models`, `reasoning_transform`, and `scored_run_approved` are byte-for-byte / value-for-value unchanged.
4. Recompute the eval-set and system-prompt hashes and confirm they still equal the unchanged hash fields.
5. Confirm the committed `eval/freeze.json` was never written.

`test_api_runs.py`

1. `POST /api/runs` with a valid prompt returns `202`, a run id, and `state: running`.
2. A second `POST` while active returns `409` with `run_in_progress`.
3. `GET` on an unknown run returns `404`.
4. `GET` on a running run returns increasing `elapsed_ms` and `max_run_seconds = 1500`.
5. A terminal run is retained for a later `GET` and evicted only after the registry limit.
6. Request bodies over 16 KB and empty prompts return `400`.

`test_api_offline.py` (injected fake client, no network)

1. **Success:** the injected fake returns a valid draft; state `succeeded`; the draft equals the fake; `issues` equals `validate_graph(draft)`; `rules_version` is present.
2. **Schema-invalid-then-valid:** the fake returns invalid JSON, then a valid draft; state `succeeded`; attempts count 2; `first_attempt_schema_valid` false.
3. **429:** the fake raises `RateLimitedError`; state `failed`, code `rate_limited`; exactly one call; no retry.
4. **Provider timeout:** the fake raises `LLMTimeoutError`; state `failed`, code `provider_timeout`; attempts follow `TIMEOUT_RETRIES`.
5. **Server run timeout:** a fake clock advances past `MAX_RUN_SECONDS` (`1500`); state `timeout`, code `run_timeout`; a late fake result is discarded.
6. **Malformed draft:** the fake returns a schema-valid draft with soft-rule violations (component in two groups, self-loop); state `succeeded`; issues non-empty; the draft is returned unchanged.
7. **Validator isolation:** the fake records every message; no `Issue` text appears; `validate_graph` is called once; a `schema_invalid` run makes zero validator calls.
8. **Injection proof:** the fake is supplied only through the dependency override; `ChatClient.__init__` is asserted never called; the suite passes with `LLM_API_KEY` unset; no fake module is importable from production packages.

`test_api_security.py`

1. CORS: **both** allowed origins (`http://127.0.0.1:5173` and `http://127.0.0.1:4173`) are echoed with the matching `Access-Control-Allow-Origin`; **one** disallowed origin (`http://localhost:5173`) gets no allow header.
2. Key redaction: a response body, a captured log record, and every error message contain neither the key value nor `Authorization`.
3. The settings object is never logged.
4. The health response contains no key or base URL (in both selected and no-model states).
5. The source has no `0.0.0.0` bind and no environment switch selecting a fake client.

### 8.2 Frontend (`frontend/src/test/*`)

`prompt-run.test.tsx`

1. Idle: prompt box and Generate button are enabled; no lock indicator.
2. Submit: `fetch` is called once with `POST /api/runs`; the canvas locks; the prompt box is disabled; the elapsed timer appears.
3. Polling: a `succeeded` payload applies the draft and issues; the lock is released; the timer stops.
4. Failure: a `failed` payload keeps the previous diagram, shows the error, and releases the lock.
5. 429: the distinct rate-limit message is shown.
6. Timeout: the run-timeout message is shown, the lock is released, the previous diagram remains.
7. No cancel button exists in the running state.
8. A poll failure is shown as `connection_lost` and keeps the previous diagram.

`atomic-apply.test.tsx`

1. The committed diagram does not change while a run is active.
2. A success swaps the draft, issues, and layout in one commit; there is no intermediate mixed state.
3. A layout failure on the new draft keeps the previous diagram and reports an error.
4. A failure or timeout never clears the committed diagram.

`blocking-flags.test.tsx`

1. A draft with a blocking flag shows the “Unresolved blocking flag” panel.
2. The panel is not dismissible, not collapsed, and remains while the canvas renders.
3. A warning-only draft does not show the blocking panel; the warning stays in the side panel.
4. The side-panel flag count matches the payload.

`dependencies.test.ts` — **rewritten step-5 source-scan test (change 3)**

1. Network calls (`fetch(`, `XMLHttpRequest`, `WebSocket`, or HTTP-client imports) occur **only** in `frontend/src/api/client.ts`. No other runtime source file may issue a network call.
2. Every network target in that file is the single configured local backend origin (`http://127.0.0.1:8000` by configuration). No other host literal, no non-loopback host, no `0.0.0.0`, and no environment-supplied arbitrary URL is allowed in runtime source.
3. Every step-5 prohibition is retained: no `validate_graph`, no `app.validation`, no provider SDK or model SDK import, no `LLM_API_KEY` or any key name, no `openrouter`, no `child_process`, and no non-loopback host in runtime source.
4. `package.json` still has no HTTP client, model SDK, backend client, or state-persistence dependency.

This is the existing step-5 `dependencies.test.ts` rewritten in place — stronger than before (the narrow network allowlist is added), with all previous bans intact. It is not deleted, weakened, or replaced by a second scan; `api-boundary.test.ts` is not created.

### 8.3 Offline end-to-end

- Build the API app with the fake client injected through `app.dependency_overrides` (or a `RunService` constructed with the fake); no environment switch, no production fake path, and no real `ChatClient` constructed.
- Start the frontend preview bound to `127.0.0.1:4173`.
- Submit a prompt; assert the lock, the elapsed timer, the success state, the validator panel, and the blocking-flag panel.
- Repeat for 429, timeout, and malformed fixtures.
- Assert no request leaves `127.0.0.1` and no key is read.
- Capture the five step-6 screenshots at 1600 × 1000.

### 8.4 Negative and security proofs

- Startup and invariant tests use temporary freeze copies; the committed `eval/freeze.json` is never edited.
- The injected-fake tests assert `ChatClient` is never constructed and pass with `LLM_API_KEY` unset.
- The key-redaction test captures a real log record and asserts the key is absent.
- The CORS test sends both allowed origins and one disallowed origin.
- The atomic-apply test inspects the committed state after every render.
- The max-time test uses a fake clock; it does not sleep for 1500 seconds.
- The invariant test compares freeze dictionaries field by field and recomputes the hashes.

---

## 9. Edge cases and risks

- **Free-model 429.** The run fails with its own message and is not retried. The daily reset is 00:00 UTC; the message says so. A 429 does not consume the previous diagram. The gated smoke test (§10) also stops on 429.
- **Long runs.** Free models take 1–3 minutes. The timer shows elapsed time and the server maximum (`max 25:00`, from the derived `1500 s`). Tab throttling can make the local tick lag; the next poll corrects it from `elapsed_ms`.
- **No model selected.** The entry refuses to start; health reports `"no model selected"` (503) and run endpoints return 503. There is no fallback path that could silently generate with the wrong model.
- **Server restart mid-run.** The next poll returns `404`; the frontend treats it as `connection_lost`, releases the lock, and keeps the previous diagram.
- **Client disconnect.** The server worker continues and the terminal result is retained for the next poll. No client-side cancellation is sent. Decision 1 = A: nothing is written to disk.
- **Double submit.** The button is disabled, and the server returns `409` for a second active run.
- **Max time versus per-call timeout.** `TIMEOUT_S` bounds one provider call; `MAX_RUN_SECONDS = 1500` bounds the whole run. Whichever fires first wins; the terminal state is written once.
- **Late worker result.** After `timeout`, a late result is discarded; it never overwrites the timeout state or the committed diagram.
- **Layout failure on a live draft.** Treated as a failed run; the previous diagram stays. The live draft is never rendered partially.
- **Malformed soft-rule drafts.** Layout normalises them and lists adjustments. The draft is returned and displayed unchanged; validator issues are shown beside it.
- **Validator issues are not errors.** They never block rendering and never trigger a retry.
- **Blocking flags.** A blocking flag is part of a valid draft and is delivered with the diagram. It is shown as unresolved, not hidden and not softened.
- **Key leakage.** Fixed error strings, redacted settings, no header logging, no raw exception text. A test scans responses, logs, and the bundle.
- **CORS.** Two exact loopback origins; no wildcard. A wrong origin (including `localhost`) fails closed.
- **Thread safety.** The registry uses a lock around state transitions; terminal state is written once. The injected client factory must be safe to call from the worker thread.
- **Dependency drift.** Exact pins, a PyPI date gate, and an audit. Findings are reported, not auto-fixed.
- **Scope creep.** No auth, deployment, persistence, prompt history, model picker, cancel, or export. Those are later steps.

---

## 10. Decisions

### Resolved in this prompt

- **MAX_RUN_SECONDS:** derived from `freeze.json` as `MAX_ATTEMPTS × (TIMEOUT_RETRIES + 1) × TIMEOUT_S + RUN_MARGIN_S = 3 × 2 × 240 + 60 = 1500 s`. No `900`.
- **Fake LLM:** no environment switch. Tests inject a fake client via dependency overrides; no fake path in production code.
- **Source-scan test:** the step-5 `dependencies.test.ts` is rewritten in place with a narrow network allowlist (client.ts + local origin only) and all bans retained; no `api-boundary.test.ts`.
- **Vite binding:** dev and preview bound to `127.0.0.1`, matching the two CORS origins; CORS tested for both allowed origins and one disallowed origin.
- **No model selected:** startup refuses, `/api/health` reports `"no model selected"` (503), run endpoints return 503, no fallback model ever.
- **Freeze invariant:** adding `selected_model` must not change any hashed or shared setting; a test enforces it.
- **Decision 1 = A — no disk log.** Runs stay in memory only. No files, no prompt text at rest, no chance of a local run being mistaken for scored evidence. Debugging uses in-memory status and the server console.
- **Decision 2 = A — one live smoke test after the gate.** Exactly one live provider call, only after the evaluation gate has written `freeze.json.selected_model` and the user has approved a build. It uses a **scratch prompt only** (never an eval prompt), the selected model, and only if `free_model_daily_requests.remaining >= 1`. It is counted against the daily quota, recorded as scratch evidence (not scored), and **stops on 429**. It proves the real transport, key handling, and endpoint end-to-end. It is not part of this build.

### Resolved earlier (retained from v1)

- FastAPI + uvicorn, one worker, in-memory registry, polling every 1 s.
- `127.0.0.1` bind; CORS to `127.0.0.1:5173` and `127.0.0.1:4173`.
- One active run; `409` for a second.
- No cancel button.
- The selected model is `freeze.json.selected_model`, written by the evaluation gate. No UI model picker, default, or environment override.
- Blocking flags are shown in a permanent “Unresolved blocking flag” panel.
- No new frontend runtime dependency.
- The endpoint does not require `scored_run_approved`; it requires a selected model.

**No decisions remain open.**

---

## 11. Report format

Per acceptance criterion in §7: pass or fail with real evidence. Then:

- the derived run-time calculation: the three freeze settings, `RUN_MARGIN_S = 60`, and the final `MAX_RUN_SECONDS = 1500`, with confirmation that no hardcoded `900` is used;
- the startup-refusal outputs for a missing, empty, and unknown selected model, and for a hash mismatch, plus the no-model `/api/health` body showing `"no model selected"` and the 503 run-endpoint response;
- the freeze-invariant proof: the added `selected_model` key, the unchanged hashed/shared settings, and the recomputed hashes;
- the shared-config equality proof: every `GenerationConfig` field for the selected model, endpoint versus harness;
- the offline scenario table: success, schema-invalid-then-valid, 429, provider timeout, server timeout, malformed draft — with the terminal state, error code, attempt count, and validator call count;
- the injection proof: no `ChatClient` construction, no environment switch, no production fake path, suite passing with `LLM_API_KEY` unset;
- the exact 429 and timeout messages shown in the UI;
- the lock and atomic-apply evidence: the committed diagram before, during, and after a failed run; the single commit on success;
- the blocking-flag evidence: the panel text, the flag payload, and a warning-only control;
- the key and CORS evidence: response/log/bundle scan, both allowed origins echoed, and the disallowed origin denied;
- the Vite binding evidence for dev and preview, matching the CORS origins;
- the rewritten `dependencies.test.ts` result: the network allowlist and every retained ban;
- every new Python dependency with exact version and PyPI publish date; the 14-day gate result; the full `pip-audit` and `npm audit` summaries;
- the existing backend (307) and frontend (55) suite results, and the step-5 screenshot regeneration result;
- the five step-6 screenshot paths and dimensions;
- `git diff --stat`, confirming only the paths in §5 changed;
- `scored_run_approved: false` and the statement that no eval prompt was used;
- the decisions taken (1 = A, 2 = A) and any deviation stated plainly;
- files created or changed.

No scored run is made. No model is evaluated. No result is reported for a model. The gated smoke test is deferred until after the gate and is not part of this build.

---

## 12. Stop condition

I implement only the paths in §5, using the resolved decisions in §10. I do not call a model or a provider in the test suite. I do not use an eval prompt. I do not modify `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`. I do not set `scored_run_approved`. I do not run a scored evaluation. I do not start step 7. I add no fake-LLM environment switch and no fake code to production paths. I write no run records to disk (decision 1 = A).

I run the backend and frontend suites, the offline end-to-end flow with injected fakes, the dependency-date check, and the audit; I report with real evidence; I commit and push to `origin/main`.

**Build gate:** do not build step 6 until (a) the evaluation gate has selected a model and written `freeze.json.selected_model`, and (b) the user has explicitly approved the build. If the field is absent, the endpoint refuses to start, `/api/health` reports `"no model selected"`, and the build is blocked. There is no fallback model. The one approved live smoke test (decision 2 = A) runs only after this gate, on a scratch prompt, and stops on 429.
