# Step 6 — Local Generation Integration

**Step prompt · v1 draft · 19 November 2026 · awaiting review; not approved for build**
**Source of truth:** project document v1.2 §4.1–§4.3, §6.8, §8.9; `README.md` “Principles”; `docs/prompts/step-3-harness.md` §5.1–§5.6 and §7; `docs/prompts/step-4-validators.md` §5.1 and §6.5; `docs/prompts/step-5-layout-render.md` §5.1–§5.6 and §7.

> This is a prompt, not a build. No code is written, no model or provider is called, and no scored run is made. `scored_run_approved` stays `false`. The build starts only after the evaluation gate has selected a model and this prompt is approved.

### Review requirements folded into this draft

1. One source of truth for generation: the endpoint calls the same `generate` function and the same `freeze.json` settings as the harness. It refuses to start when `freeze.json` has no selected model.
2. Validators report only. They never feed back into generation or retry.
3. The lock is released on success, failure, and timeout. A failed run shows the error, with HTTP 429 as its own message, and keeps the previous diagram untouched. There is no cancel button in this step.
4. Long runs: a progress state with elapsed time, and a server-side maximum run time.
5. The server binds to `127.0.0.1` only, CORS is limited to the local frontend origin, and the API key never reaches the browser, logs, or responses.
6. Tests: offline end-to-end using fake LLM fixtures for success, schema-invalid-then-valid, 429, timeout, and a malformed draft. No live call in the test suite.
7. Dependencies: exact versions, nothing published in the last 14 days, and the dependency audit reported.
8. Blocking flags: delivered with the diagram and shown prominently as “unresolved”, never hidden.
9. Two decisions are left to the user in §10: run records on disk, and one live smoke test after the evaluation gate.

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

The user types a prompt, the canvas locks for the whole run, progress shows elapsed time, and the result is applied atomically. A failed or timed-out run leaves the previous diagram exactly as it was. Blocking flags are delivered with the diagram and shown prominently as unresolved.

This step proves the integration only. It does not evaluate a model, does not use an eval prompt, and does not produce scored evidence.

---

## 2. In scope

- A local FastAPI application under `backend/app/api/`, bound to `127.0.0.1` only, with one worker and an in-memory run registry.
- Startup that loads `eval/freeze.json`, requires a selected model, verifies the frozen system-prompt hash, and refuses to start otherwise.
- One shared generation-config builder used by both the harness runner and the endpoint, so there is one source of truth for temperature, token cap, timeout, attempts, response mode, reasoning, system prompt, and schema.
- `POST /api/runs` and `GET /api/runs/{run_id}` with the contract in §6.3.
- Generation through `app.llm.generate.generate` and validation through `app.validation.validators.validate_graph`.
- A server-side maximum run time and a progress state with elapsed time.
- A frontend prompt box, a running/progress state, a distinct 429 message, and lock release on every terminal state.
- Atomic apply: the previous diagram is replaced only after a successful run has produced a complete draft, validator issues, and a successful layout.
- A prominent “Unresolved blocking flag” panel, plus the existing side-panel flag list.
- Offline tests with fake LLM fixtures for success, schema-invalid-then-valid, 429, timeout, and a malformed draft.
- A Python dependency-date check and a Python audit report, with exact versions.
- Step-6 screenshots captured offline from the fake client.

## 3. Out of scope

- Any scored run, eval prompt, rubric, human scoring, or `eval_set.json` read. The prompt comes from the user.
- Any change to `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`. These are read-only inputs.
- Prompt tuning, rubric changes, threshold changes, or validator-rule changes.
- Feeding validator issues back into generation, retry messages, or the system prompt.
- A cancel button, a run queue, concurrent runs, streaming tokens, or a chat transcript.
- Auth, users, sessions, rate limiting, deployment, containers, a cloud service, or a public bind.
- Persistence, a database, localStorage, prompt history, or export.
- Editing the architecture, dragging nodes, or writing coordinates into a draft.
- A model picker in the UI. The selected model is the one `freeze.json` names.
- A live provider call in the test suite.
- Step 5 rework. The layout, canvas, fixtures, and screenshots stay as approved unless the user reports a visual issue.

---

## 4. Inputs from earlier steps

- `eval/freeze.json` — the single source of generation settings. At drafting time it carries `system_prompt_version "1.1"`, `system_prompt_sha256 21A2D1F1…D961`, `shared_settings` (`TEMPERATURE 0.3`, `TIMEOUT_S 240`, `MAX_ATTEMPTS 3`, `TIMEOUT_RETRIES 1`), `max_tokens 32768`, `models`, `reasoning_transform null`, and `scored_run_approved false`.
- `freeze.json.selected_model` — **not present yet.** The evaluation gate writes this top-level string when it selects a model. Step 6 never writes `freeze.json`; it only reads the field. Absence is a startup refusal, not a default.
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
        __main__.py              # uvicorn entry, 127.0.0.1 only
        main.py                  # FastAPI app, CORS, routes, lifespan
        models.py                # request/response Pydantic models
        runs.py                  # in-memory registry, one active run, max-time watchdog
        generation.py            # build config, call generate, call validate_graph
        config.py                # freeze loading, selected model, shared config builder
      eval\
        runner.py                # edit only to call the shared config builder
    scripts\
      check-dependency-dates.py  # PyPI publish-date gate for direct Python dependencies
    tests\
      fixtures\api\
        success.json
        schema_invalid_then_valid.json
        malformed.json
      test_api_startup.py
      test_api_runs.py
      test_api_offline.py
      test_api_security.py
    pyproject.toml               # edit: add exact-pinned fastapi, uvicorn, httpx, pip-audit
  frontend\
    src\
      api\
        client.ts                # the only runtime module allowed to call fetch(127.0.0.1)
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
        api-boundary.test.ts
        dependencies.test.ts     # edit: loopback-API allowlist, still no model/key/validator
      App.tsx                    # edit: prompt box, lock, progress, atomic apply
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
- `backend/app/eval/runner.py` changes only to call the shared config builder; its scored-run behaviour is unchanged.
- No change to `frontend/src/layout/`, `frontend/src/render/Canvas.tsx`, `IssuesPanel.tsx`, `AdjustmentsPanel.tsx`, `Legend.tsx`, or `theme.ts`.
- No change to the nine step-5 screenshots or their tests.

---

## 6. Proposed design

### 6.1 Process topology

- FastAPI + uvicorn on `127.0.0.1:8000`, one worker, no reload in the run command.
- Vite dev server on `127.0.0.1:5173`; `vite preview` on `127.0.0.1:4173`.
- The frontend calls the API directly at `http://127.0.0.1:8000`; no proxy is required.
- One active run at a time. The registry is in memory; restarting the server drops runs.

### 6.2 Freeze selection and the shared config builder

At startup, before serving:

1. Read `eval/freeze.json`.
2. Require `selected_model` to be a non-empty string and a key in `freeze["models"]`. If it is missing, empty, or unknown, raise a startup error that names the file and the field, prints no key material, and exits non-zero. No default model, no environment override, no fallback to the first entry.
3. Require the loaded system prompt’s SHA-256 to equal `freeze["system_prompt_sha256"]`. A mismatch is a startup refusal.
4. Build the model settings with `load_model_settings(freeze["models"][selected_model])`; the key comes from the environment or the git-ignored `.env`.

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

A test proves the endpoint’s config equals the config the harness builds for the same selected model, field for field.

### 6.3 API contract

`POST /api/runs`

```json
{ "prompt": "Design a URL shortener for 10k redirects per second." }
```

- `202 Accepted` with `{ "run_id": "...", "state": "running", "started_at": "...", "max_run_seconds": 900 }`.
- `400` for an empty prompt, a non-string prompt, or a body over 16 KB.
- `409` with `{ "error": { "code": "run_in_progress", "message": "..." } }` when a run is already active.
- `503` when the server has no selected model or the prompt hash check failed at startup (the process should not be serving in that state; this is defence in depth).

`GET /api/runs/{run_id}`

```json
{
  "run_id": "...",
  "state": "running",
  "elapsed_ms": 41230,
  "max_run_seconds": 900,
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
- Error codes: `rate_limited`, `provider_timeout`, `run_timeout`, `schema_invalid`, `truncated`, `transport_error`, `internal_error`, `connection_lost`.
- `404` for an unknown or evicted run.
- Every response is `Cache-Control: no-store`.
- No response contains the API key, the base URL, the raw provider payload, or the system prompt.

`GET /api/health`

```json
{ "status": "ok", "model": "<selected model name>", "system_prompt_version": "1.1", "rules_version": "1.1", "max_run_seconds": 900 }
```

The health response is the only place the selected model name is exposed. It is not a secret.

### 6.4 Run lifecycle

- `POST` creates a run in `queued`, starts a worker thread, and returns immediately.
- The worker moves the run to `running`, calls generation, then validation, and writes the terminal state once.
- The registry holds at most 10 recent runs; the oldest terminal run is evicted first. Eviction is deterministic.
- `started_at` is monotonic. `elapsed_ms` is computed server-side on every `GET`; the frontend also ticks locally between polls.
- `MAX_RUN_SECONDS = 900` (15 minutes). It is a server constant, not a request parameter. It is above the realistic 1–3 minute free-model range and below an unbounded wait.
- A watchdog, or the `GET` handler, marks a run `timeout` when `elapsed_ms > MAX_RUN_SECONDS * 1000`. The terminal state is written once; any late worker result is discarded. The lock in the frontend is released by the terminal state.
- There is no cancel endpoint and no cancel button.
- A second `POST` while a run is active returns `409`; it does not queue.

### 6.5 Generation then validation

- Build the config once per run through the shared builder.
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
- `RunStatus` shows the state, the elapsed time (`m:ss`), and the server maximum (`max 15:00`). It uses an indeterminate bar, never a fake percentage.
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

### 6.9 Security and locality

- `uvicorn` binds to `127.0.0.1` only. No `0.0.0.0`, no host from an untrusted environment variable.
- CORS allowlist: `http://127.0.0.1:5173` and `http://127.0.0.1:4173`. No `*`, no credentials, no arbitrary origin reflection. The list is a constant; adding an origin is a code change.
- The API key is read only by the server through `load_model_settings`. It is never sent to the browser, never serialised, never logged, and never placed in an error message.
- The server logs request method, path, run id, state, and elapsed time only. It does not log headers, bodies, the settings object, or provider responses.
- Errors are fixed strings. A provider exception is mapped to a code; its raw text is not returned.
- The request body is capped at 16 KB.
- The frontend bundle contains no `LLM_API_KEY`, no provider URL, and no model SDK. The only network target is the loopback API.
- No auth, by design, because the bind and CORS keep it local.

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
2. A startup test proves refusal for a missing, empty, or unknown `selected_model`, and for a system-prompt hash mismatch. No default model is used.
3. The endpoint and the harness build identical `GenerationConfig` values for the selected model, proven by a test that compares every field.
4. The endpoint calls `app.llm.generate.generate`; it does not reimplement generation, retry, or parsing.
5. A successful run returns the exact `ArchitectureDraft`, the `validate_graph` issues, and `rules_version`.
6. `validate_graph` is called exactly once per successful run, and no issue text appears in any generation or retry message.
7. The canvas is locked from submit until a terminal state, and unlocked on success, failure, and timeout.
8. A failed or timed-out run leaves the previously committed diagram unchanged, and the error is shown.
9. HTTP 429 is shown as its own message; it is not retried.
10. The progress state shows elapsed time and the server maximum; `MAX_RUN_SECONDS` is enforced server-side and produces `timeout`.
11. A second submit while a run is active returns `409` and does not start a second run.
12. Atomic apply: the committed entry changes once, only after a successful layout; there is no partial update.
13. Every blocking flag is shown in a prominent “Unresolved blocking flag” panel, not hidden; warning flags are not labelled unresolved.
14. The validator panel and flag panel render the live payload with correct counts, and the layout adjustments panel renders live normalisation notes.
15. The API key never appears in the browser bundle, any response, any log line, or any error message; a test scans for it.
16. CORS allows exactly `http://127.0.0.1:5173` and `http://127.0.0.1:4173`; a disallowed origin gets no allow header.
17. Offline tests cover success, schema-invalid-then-valid, 429, provider timeout, server run timeout, and a malformed draft; the suite runs with no `LLM_API_KEY` and makes no live call.
18. The malformed-draft case returns a draft plus non-empty issues and does not crash layout or render.
19. Every new Python dependency is exact-pinned, older than 14 days, and listed with its publish date; `pip-audit` and `npm audit` summaries are reported.
20. The existing 307 backend tests and 55 frontend tests still pass; the nine step-5 screenshots still regenerate.
21. No file under `eval/`, `prompts/system/`, `schema/`, or `eval/freeze.json` is modified; `scored_run_approved` remains `false`.
22. Five step-6 screenshots exist under `docs/screenshots/step-6/`, each 1600 × 1000, produced offline from the fake client.
23. The source-boundary test allows `fetch(` and `127.0.0.1` only in `frontend/src/api/client.ts`, and still forbids provider SDKs, `LLM_API_KEY`, `openrouter`, `validate_graph`, `app.validation`, and any non-loopback host in runtime source.
24. The changes are committed and pushed to `origin/main`.

---

## 8. Tests

### 8.1 Backend offline (`backend/tests/test_api_*.py`)

`test_api_startup.py`

1. Missing `selected_model` → startup error, non-zero exit, message names `freeze.json` and the field.
2. Empty `selected_model` → same.
3. `selected_model` not in `models` → same.
4. System-prompt hash mismatch → startup refusal.
5. Valid freeze → app starts; `GET /api/health` reports the selected model, version, rules version, and max run time.

`test_api_runs.py`

1. `POST /api/runs` with a valid prompt returns `202`, a run id, and `state: running`.
2. A second `POST` while active returns `409` with `run_in_progress`.
3. `GET` on an unknown run returns `404`.
4. `GET` on a running run returns increasing `elapsed_ms` and `max_run_seconds`.
5. A terminal run is retained for a later `GET` and evicted only after the registry limit.
6. Request bodies over 16 KB and empty prompts return `400`.

`test_api_offline.py` (fake client, no network)

1. **Success:** the fake returns a valid draft; state `succeeded`; the draft equals the fake; `issues` equals `validate_graph(draft)`; `rules_version` is present.
2. **Schema-invalid-then-valid:** the fake returns invalid JSON, then a valid draft; state `succeeded`; attempts count 2; `first_attempt_schema_valid` false.
3. **429:** the fake raises `RateLimitedError`; state `failed`, code `rate_limited`; exactly one call; no retry.
4. **Provider timeout:** the fake raises `LLMTimeoutError`; state `failed`, code `provider_timeout`; attempts follow `TIMEOUT_RETRIES`.
5. **Server run timeout:** a fake clock advances past `MAX_RUN_SECONDS`; state `timeout`, code `run_timeout`; a late fake result is discarded.
6. **Malformed draft:** the fake returns a schema-valid draft with soft-rule violations (component in two groups, self-loop); state `succeeded`; issues non-empty; the draft is returned unchanged.
7. **Validator isolation:** the fake records every message; no `Issue` text appears; `validate_graph` is called once; a `schema_invalid` run makes zero validator calls.

`test_api_security.py`

1. CORS: an allowed origin is echoed; a disallowed origin gets no allow header.
2. Key redaction: a response body, a captured log record, and every error message contain neither the key value nor `Authorization`.
3. The settings object is never logged.
4. The health response contains no key or base URL.
5. The source has no `0.0.0.0` bind.

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

`api-boundary.test.ts`

1. `fetch(` and `127.0.0.1` occur only in `src/api/client.ts`.
2. No `LLM_API_KEY`, provider SDK, `openrouter`, `validate_graph`, `app.validation`, `child_process`, or non-loopback host appears in runtime source.
3. `package.json` still has no HTTP client, model SDK, backend client, or state-persistence dependency.

### 8.3 Offline end-to-end

- Start the API with `PALADIN_FAKE_LLM=1`, which loads a deterministic fake client from `backend/tests/fixtures/api/`. The fake is selected before any real `ChatClient` is constructed.
- Start the frontend preview.
- Submit a prompt; assert the lock, the elapsed timer, the success state, the validator panel, and the blocking-flag panel.
- Repeat for 429, timeout, and malformed fixtures.
- Assert no request leaves `127.0.0.1` and no key is read.
- Capture the five step-6 screenshots at 1600 × 1000.

### 8.4 Negative and security proofs

- Startup tests use temporary freeze copies; the committed `eval/freeze.json` is never edited.
- The fake-client tests assert `ChatClient` is never constructed and the suite passes with `LLM_API_KEY` unset.
- The key-redaction test captures a real log record and asserts the key is absent.
- The CORS test sends both an allowed and a disallowed origin.
- The atomic-apply test inspects the committed state after every render.
- The max-time test uses a fake clock; it does not sleep for 900 seconds.

---

## 9. Edge cases and risks

- **Free-model 429.** The run fails with its own message and is not retried. The daily reset is 00:00 UTC; the message says so. A 429 does not consume the previous diagram.
- **Long runs.** Free models take 1–3 minutes. The timer shows elapsed time and the server maximum. Tab throttling can make the local tick lag; the next poll corrects it from `elapsed_ms`.
- **Server restart mid-run.** The next poll returns `404`; the frontend treats it as `connection_lost`, releases the lock, and keeps the previous diagram.
- **Client disconnect.** The server worker continues and the terminal result is retained for the next poll. No client-side cancellation is sent.
- **Double submit.** The button is disabled, and the server returns `409` for a second active run.
- **Max time versus per-call timeout.** `TIMEOUT_S` bounds one provider call; `MAX_RUN_SECONDS` bounds the whole run. Whichever fires first wins; the terminal state is written once.
- **Late worker result.** After `timeout`, a late result is discarded; it never overwrites the timeout state or the committed diagram.
- **Layout failure on a live draft.** Treated as a failed run; the previous diagram stays. The live draft is never rendered partially.
- **Malformed soft-rule drafts.** Layout normalises them and lists adjustments. The draft is returned and displayed unchanged; validator issues are shown beside it.
- **Validator issues are not errors.** They never block rendering and never trigger a retry.
- **Blocking flags.** A blocking flag is part of a valid draft and is delivered with the diagram. It is shown as unresolved, not hidden and not softened.
- **Key leakage.** Fixed error strings, redacted settings, no header logging, no raw exception text. A test scans responses, logs, and the bundle.
- **CORS.** Two exact loopback origins; no wildcard. A wrong origin fails closed.
- **Thread safety.** The registry uses a lock around state transitions; terminal state is written once.
- **Dependency drift.** Exact pins, a PyPI date gate, and an audit. Findings are reported, not auto-fixed.
- **Scope creep.** No auth, deployment, persistence, prompt history, model picker, cancel, or export. Those are later steps.

---

## 10. Decisions

### Resolved in this draft

- FastAPI + uvicorn, one worker, in-memory registry, polling every 1 s.
- `127.0.0.1` bind; CORS to `127.0.0.1:5173` and `127.0.0.1:4173`.
- One active run; `409` for a second.
- `MAX_RUN_SECONDS = 900`.
- No cancel button.
- The selected model is `freeze.json.selected_model`, written by the evaluation gate. No UI model picker and no environment override.
- Blocking flags are shown in a permanent “Unresolved blocking flag” panel.
- No new frontend runtime dependency.
- The endpoint does not require `scored_run_approved`; it requires a selected model.

### Decisions for the user

**Decision 1 — run records on disk.**
Should each local run be logged to disk in the harness run-record format?

- **A. No disk log (recommended).** Keep runs in memory only. No files, no chance of a local run being mistaken for scored evidence, and no prompt text at rest. Debugging uses the in-memory status and the server console.
- **B. Write one record per run.** Write to `runs/step-6/<run_id>.json` in the same shape as the harness record: model, base-URL host, system-prompt version/hash, settings, attempts, `final_status`, `first_attempt_schema_valid`, prompt SHA-256, and the draft. The key is redacted; the prompt text is not stored, only its hash. The evaluator never reads this directory. This gives a durable trace at the cost of files on disk.

**Decision 2 — one live smoke test.**
Should one live provider call be allowed after the evaluation gate selects a model?

- **A. Yes, exactly one (recommended).** After the gate, with the selected model, on a scratch prompt only (never an eval prompt), only if `free_model_daily_requests.remaining >= 1`. It is recorded as scratch evidence, not scored, and stops on 429. It proves the real transport, the key handling, and the endpoint end-to-end.
- **B. No live call.** Rely on the offline fake-client suite. The first live call happens inside the evaluation gate. This preserves the daily quota but leaves the real transport unproven until the gate.

---

## 11. Report format

Per acceptance criterion in §7: pass or fail with real evidence. Then:

- the startup-refusal outputs for a missing, empty, and unknown selected model, and for a hash mismatch;
- the shared-config equality proof: every `GenerationConfig` field for the selected model, endpoint versus harness;
- the offline scenario table: success, schema-invalid-then-valid, 429, provider timeout, server timeout, malformed draft — with the terminal state, error code, attempt count, and validator call count;
- the exact 429 and timeout messages shown in the UI;
- the lock and atomic-apply evidence: the committed diagram before, during, and after a failed run; the single commit on success;
- the blocking-flag evidence: the panel text, the flag payload, and a warning-only control;
- the key and CORS evidence: the response/log/bundle scan, the allowed and disallowed origins;
- every new Python dependency with exact version and PyPI publish date; the 14-day gate result; the full `pip-audit` and `npm audit` summaries;
- the existing backend (307) and frontend (55) suite results, and the step-5 screenshot regeneration result;
- the five step-6 screenshot paths and dimensions;
- `git diff --stat`, confirming only the paths in §5 changed;
- `scored_run_approved: false` and the statement that no eval prompt was used;
- files created or changed;
- the decisions taken on §10 and any deviation stated plainly.

No scored run is made. No model is evaluated. No result is reported for a model.

---

## 12. Stop condition

I implement only the paths in §5, using the resolved decisions in §10 and the user’s answers to the two open decisions. I do not call a model or a provider in the test suite. I do not use an eval prompt. I do not modify `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`. I do not set `scored_run_approved`. I do not run a scored evaluation. I do not start step 7.

I run the backend and frontend suites, the offline end-to-end flow, the dependency-date check, and the audit; I report with real evidence; I commit and push to `origin/main`.

**Build gate:** do not build step 6 until the evaluation gate has selected a model and written `freeze.json.selected_model`. If the field is absent, the endpoint refuses to start, and the build is blocked.
