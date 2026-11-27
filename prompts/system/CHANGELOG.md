# System prompt calibration log

Every revision of the generation system prompt made during calibration is
recorded here. Each revision gets a version bump, the **scratch** evidence that
prompted it, and the before/after scratch result. Only the scratch set
(`scratch/scratch_prompts.json`) may be cited. Eval prompts are never used as
evidence and never appear in this log.

A revision is only made when a scratch run shows a defect. Tuning to make an
eval prompt pass is not allowed.

## Scratch call log

Every scratch call is attributed to a model slug and a date, so a free model
that changes mid-evaluation is detectable. There is one entry per invocation;
every call in an invocation carries that invocation's date and slug. `calls`
counts provider requests, including schema retries and truncation reruns.

| Date (UTC) | Model slug | Mode | Calls | Result |
|---|---|---|---:|---|
| 2026-11-19 | `inclusionai/ling-3.2-flash:free` | `json_schema` | 8 | All calls truncated at 4096: `content: null`, `finish_reason: length`, 4096 reasoning tokens, ~11 min per call. 4 records + 1 in-flight + 3 diagnostics. |
| 2026-11-19 | `nvidia/nemotron-3.5-super-vl:free` | `json_schema` | 15 | 5/5 schema-valid; first attempt valid 3/5 at the cap that succeeded. |
| 2026-11-19 | `nvidia/nemotron-3.5-super-vl:free` | `schema_in_prompt` | 17 | 5/5 schema-valid; first attempt valid 4/5 at the cap that succeeded. |
| 2026-11-19 | `google/gemma-4-31b-it:free` | `json_schema` | 0 counted | HTTP 429 from the upstream shared pool on every attempt; the provider did not count these against the daily limit. No scratch evidence. |
| 2026-11-20 | `nvidia/nemotron-3.5-super-vl:free` | `json_schema` | 5 | v1.1 retest. Fixed cap 32768, 16-call cap. 5/5 schema-valid on the first attempt, 0 retries, all `finish_reason: stop`. |
| 2026-11-20 | `nvidia/nemotron-3.5-super-vl:free` | `schema_in_prompt` | 5 | v1.1 retest. Fixed cap 32768, 16-call cap. 5/5 schema-valid on the first attempt, 0 retries, all `finish_reason: stop`. |
| 2026-11-20 | `inclusionai/ling-3.2-flash:free` | `json_schema` | 1 | v1.1 retest (`--reasoning-disabled`). Fixed cap 32768, 16-call cap. First call returned HTTP 429 (`rate_limited`) with no usage data, so reasoning-token verification was not possible. Stop-and-resume: no retry and no further ling call. |
| 2026-11-23 | `nvidia/nemotron-3.5-super-vl:free` | `json_schema` | 7 | v1.2 scratch check. Fixed max_tokens 32768, max 1 retry per prompt, 10-call cap. 5/5 schema-valid; first attempt 3/5; sc_04/sc_05 retries were group-level assumption-coupling validation errors; all `finish_reason: stop`, no 429. Runner stored metrics but not drafts. |
| 2026-11-23 | `nvidia/nemotron-3.5-super-vl:free` | `json_schema` | 5 | v1.2 capture-only rerun. Fixed max_tokens 32768, max 1 retry per prompt, 10-call cap. 5/5 schema-valid on the first attempt, 0 retries, all `finish_reason: stop`, no 429; drafts captured. |
| 2026-11-26 | `nvidia/nemotron-3.5-super-vl:free` | `json_schema` | 11 | v1.3 scratch check (system prompt v1.3). Fixed max_tokens 32768, call cap 10 (5 prompts + at most 1 retry/prompt). 6 official calls: 4/5 schema-valid first attempt, 0 retries, sc_04 transport_error on retry (2 calls, no usable draft). 5 additional capture-only calls captured drafts for sc_01/02/03/05. No 429. |

The provider's `GET /api/v1/key` reported 42 free-model requests used on
2026-11-19 (limit 50) after the original calls. A 429 is stop-and-resume and was
not retried.

The 2026-11-20 retests each ran as a separate invocation against `LLM_API_KEY`
only, with `--max-calls 16` and `--fixed-max-tokens 32768` (no cap ladder). A
redacted `GET /api/v1/key` was checked before each invocation: limit 50 with
`used` 0 / remaining 50, then `used` 3 / remaining 47, then `used` 10 /
remaining 40 — all above the 16-call gate. The primary counter did not change
on the ling 429 (`used` stayed 10). Only scratch prompts were used; no eval-set
prompt was run.

The 2026-11-23 v1.2 scratch check ran as two separate scratch-only invocations
against `LLM_API_KEY` only: 7 calls in the sanctioned invocation (metrics stored,
drafts not stored by the runner) and 5 in the authorized capture-only rerun, 12
calls total, each with fixed max_tokens 32768, at most 1 retry per prompt and a
10-call cap. A redacted `GET /api/v1/key` before the first invocation reported
`free_model_daily_requests` limit 50 / used 0 / remaining 50. No 429 occurred,
no eval prompt was run, v1.2 wording was unchanged and the active prompt remains
v1.1. No `selected_model` was set and `scored_run_approved` remains false.

## Credential attribution (from 19 November 2026)

Credentials are recorded by environment variable name only. No key value or
key label appears in this log.

| Env variable | Account | Calls it is used for |
|---|---|---|
| `LLM_API_KEY` | primary | Original scratch calibration calls above and the primary daily-counter readings. Last primary reading 2026-11-19 09:13 UTC: `used` 45 of 50. |
| `LLM_API_KEY_2` | secondary | Read-only `GET /api/v1/key` validation and daily-counter re-checks from 2026-11-19. Re-check 2026-11-19: `free_model_daily_requests` limit 50, used 0, remaining 50 — a separate account. |

The 2026-11-20 v1.1 retests (scratch call log above) used `LLM_API_KEY` only,
per the user's explicit instruction; `LLM_API_KEY_2` was not used for any
retest call. Scored runs are not started and `selected_model` is not set.

## 1.0 - 19 November 2026

Baseline, before calibration. No revision yet.

- Prompt: `prompts/system/architecture-v1.md`
- SHA-256: `354463764DB1DEB2DDAA09B7E9DC5568337AAD5399126CAA85CB985822947880`
- Scratch evidence: none (baseline)
- Change: none
- Before/after scratch result: not applicable (baseline)

## 1.1 — 19 November 2026

- Prompt: `prompts/system/architecture-v1.md`
- SHA-256: `21A2D1F12A14EC4FFB3139E997F4F3A9D07F425A4156B1B1003870FFBA12D961`
- Scratch evidence: `sc_01` and `sc_02` (`json_schema`) were the only
  `json_schema` first attempts that failed validation, and every error was
  assumption coupling: 10 elements in total — `sc_01` had 6 (connections
  `8`/`9` with `assumed=True` and no `rationale`, groups `0`–`2` with
  `assumed=False` and no `requirement_refs`, group `3` with `assumed=True`
  and no `rationale`); `sc_02` had 4 (groups `0`–`2` with `assumed=False`
  and no `requirement_refs`, group `3` with `assumed=True` and no
  `rationale`). The remaining three prompts were valid on the first
  attempt. `sc_02` (`schema_in_prompt`) separately emitted
  `replicas="10000"`; that is a separate contract defect and is not cited
  as evidence for this wording change.
- Change: replaced the two-line Assumptions section with an explicit
  two-form rule. `assumed: false` now requires at least one requirement id
  in `requirement_refs`; `assumed: true` now requires a non-empty
  sentence in `rationale`. The text states that an element presented as
  fact with no requirement, or an assumption with no stated reason, is
  invalid, and that one form must be chosen for each element.
- Before/after scratch result: before — 2/5 `json_schema` first attempts
  invalid, both assumption coupling (10 elements). After — 2026-11-20 retest:
  5/5 `json_schema` first attempts valid, 0 retries, all `finish_reason: stop`;
  `schema_in_prompt` also 5/5 first-attempt valid. Assumption-coupling errors
  dropped from 2/5 to 0/5 and no new generation or validation error kind
  appeared. The ling retest could not be evaluated: its first call returned
  HTTP 429 with no usage data, so the reasoning-disabled check was not
  performed and no further ling call was made.
- Pre-registered acceptance rule: v1.1 is kept if the assumption-coupling
  errors drop and no new error kind appears. If it is worse, revert to
  1.0 and report. No further prompt changes without user approval.
- Verdict (2026-11-20): **keep 1.1**. Assumption-coupling errors dropped
  (2/5 -> 0/5) with no new error kind on the two nemotron retests. The
  incomplete ling retest (429) is excluded from this verdict and remains
  unresolved. No scored run was started and no model was frozen.

## v1.3 — 26 November 2026 (frozen as versioned pair, not active)

Status: **frozen as a versioned pair with eval set v3.0; not active**. Prompt file: `prompts/system/architecture-v1.3.md`.
SHA-256: `A87CC5555D2BBF668FCDAB5EC112DDDFA2CC59D05AF8FA738BA5B29142E41CDB`.
The default system prompt remains v1.1 (`architecture-v1.md`); this entry does not change the active hash or the v1.0 freeze.

- Derived from: **scored v2 failures** on `nemotron-3.5-super-vl` (eval set v2.0
  `BD713F57...E2770E`, prompt v1.2 `EE6E94BF...3D2D`, 2026-11-26, 45 runs). This
  follows the same scored-failure evidence exception as v1.2, approved by the
  product owner in step 8.
- Evidence: `ev2_14` failed the deterministic gate in 3/3 runs (`r01 component_count(lte=7)`,
  `r03 assumption_present(text~="scal")`; optional blocking flag skipped). In all
  three runs the model over-engineered a vague prompt with generic scale/modernity
  components (10-11 components) and expressed scale/unstated-choice uncertainty in
  flags/rationales/component rationales, but left the top-level `assumptions` array
  empty, missing the deterministic assumption predicate. The mechanical verdict was
  FAIL (adversarial 2/3; gate 14/15; first-attempt schema-valid 42/45; blocking
  flags correct in both directions). v2 rubric/thresholds/settings/evaluators were
  not changed.
- Change: adds one rule in `## Assumptions and traceability` requiring assumptions
  about unstated quantities, definitions, or choices to be recorded in the top-level
  `assumptions` array (not only in flags or rationales); for vague prompts, state the
  assumed quantity (scale, users, budget) as an assumption entry and justify any
  scalability component against that stated assumption; do not add generic scalability
  or modernity components that no stated requirement or stated assumption needs.
  `## Minimal, justified structure` gets a one-line cross-reference. The "do not omit
  a necessary component" rule remains unchanged. The wording is generic and names no
  eval id, domain, or v2 artifact.
- Held-out status: v1.0 and v2.0 remain historical scored sets; neither is held-out
  for v1.3. v1.3 is to be evaluated only on a new held-out v3.0 set, once per model,
  under the single-shot protocol.
- Scratch evidence (2026-11-26, `nvidia/nemotron-3.5-super-vl:free`, `json_schema`, system prompt v1.3, fixed max_tokens 32768, call cap 10, 11 calls total: 6 official + 5 capture-only draft capture): 4/5 schema-valid on first attempt in official run (sc_01-03,05); sc_04 `transport_error` on retry after a schema-invalid/stop first attempt, no usable draft. No 429. Clean prompts sc_01/sc_02/sc_03 had 0 flags and included service + durable store. sc_05 (vague) raised 1 underspecified warning (not blocking), included service + durable store; assumptions array was empty (0) despite vague/unstated quantities/choices. sc_01/sc_02/sc_03 assumptions arrays empty. No structural regression observed on captured drafts; v1.3 did not reliably induce assumption-array entries for sc_05's unstated quantities/choices. No v1.3 wording or eval file changed.

## Proposed v1.3.1 — 26 November 2026 (candidate, not frozen)

Status: **proposed candidate**. Prompt file: `prompts/system/architecture-v1.3.1.md`.
SHA-256: `B43D4E7E2B0D55CF8CBB8BA5E55462E819982CCAE4F0DD1720F8D28EA98B3870`.
The active default system prompt remains v1.1; v1.3 remains the frozen versioned pair with eval set v3.0. This entry does not change the active hash or the frozen v3 pair.

- Derived from: the **v1.3 scratch check** on `sc_05` (vague prompt) where an `underspecified` warning was raised but the top-level `assumptions` array was empty. **Scratch prompts are not held out**; this is scratch evidence only.
- **Disclosed late change relative to v3 authoring:** this candidate is proposed after v3.0/v1.3 versioned freeze and before any v3 scored run. It is disclosed here for product-owner review; no eval file was changed.
- Change: adds one generic paragraph in `## Assumptions and traceability`: "Every flag of kind underspecified must be accompanied by at least one entry in the top-level assumptions array that states the value or choice you assumed. Do not leave the assumptions array empty when you raise such a flag." No other wording changed. Generic wording; no eval id, domain, or v2/v3 artifact named.
- Before/after scratch result: pending product-owner approval and a v1.3.1 scratch check.

## Proposed v1.3.2 — 27 November 2026 (candidate, not active)

Status: **candidate for product review**. Prompt file: `prompts/system/architecture-v1.3.2.md`.
SHA-256: `DEA702353DDC4D8A74D381F077F2F7998F76897013D5C01E9BF98C78B2E49616`.
The active default system prompt remains v1.1; v1.3 remains the frozen versioned pair with eval set v3.0. This candidate is registered for reproducibility and does not change the active prompt or frozen evaluation pair.

- Change: adds generic rules for concise component names, meaningful groups and short action labels; protocols belong in the technology field. The rules contain no evaluation prompts or domain-specific examples.
- Before/after scratch result: pending; no model call or evaluation run was made.

<!--
Format for a calibration revision:

## <version> — <date>

- Prompt: `prompts/system/architecture-v1.md`
- SHA-256: `<sha256 of the prompt after the change>`
- Scratch evidence: `<scratch prompt id(s)> and the observed defect`
- Change: `<what changed and why>`
- Before/after scratch result: `<before: observed result> -> <after: observed result>`
-->

## Proposed v1.2 — 21 November 2026 (approved, not frozen)

Status: **proposed**. Prompt file: `prompts/system/architecture-v1.2.md`.
SHA-256: `EE6E94BF49E16AD22D6EE0191D3C0F50D0FC2DA7D956ABD4458C4BAAF1CE3D2D`
(draft digest, recorded for the §12 review; it is not a freeze).
The default system prompt remains v1.1 (`architecture-v1.md`); this entry does
not change the active hash or the v1.0 freeze.

- Derived from: the **scored v1.0 run** of nemotron-3.5-super-vl, not from
  scratch. This is a deliberate exception to the scratch-only evidence rule
  above, approved by the product owner in step 7 v2.
- Evidence: 13 class-(c) failed-item instances — ev_03 r04 (2), ev_08 x02/x03
  (6), ev_12 run-3 x03 (1), ev_13 run-3 x01 (1), ev_14 r01 (3) — showed no
  rule requiring components to be justified by stated requirements and no
  `client` vs `service` definition. Five class-(a) instances — ev_15 run-1 r04,
  ev_13 run-1 r01/r02/r03, ev_09 r10 — violated instructions v1.1 already
  contains and are reinforced, not introduced.
- Change: adds a `Minimal, justified structure` section covering functional and
  non-functional requirements (scale, availability, latency, durability,
  security) and stated assumptions about unstated quantities or definitions;
  defines `client` and `service`; requires a blocking contradiction flag when
  stated requirements cannot all hold; and requires a complete design even when
  a flag is present.
- Held-out status: **v1.0 is no longer held-out for v1.2**. Its scored results
  are the evidence for the change and may never be reported as a v1.2 result.
  v1.2 is evaluated only on the new held-out set `eval/eval_set_v2.json`, once
  per model, under the single-shot protocol.
- Scratch evidence: 2026-11-23 structural regression check on all five scratch
  prompts (`sc_01`–`sc_05`, `json_schema`, nemotron-3.5-super-vl): 7 calls in the
  sanctioned invocation plus 5 in the authorized capture-only rerun, 12 total.
  sc_01 (6 components), sc_02 (7; load balancer and cache defensible from the
  stated scale and live-view needs) and sc_03 (3) had 0 flags and no unrequested
  components. sc_04 (7) raised the required blocking contradiction flag while
  retaining a full design; sc_05 (5) raised one `underspecified` warning with all
  elements stated as assumptions and rationales — its identity provider and load
  balancer are arguably unrequested for the vague prompt, but not a new v1.2
  defect. Every draft typed the owned application as `service` with a durable
  store.
- Before/after scratch result: no structural regression versus v1.1 — clean
  prompts stayed clean, the contradictory prompt raised the required blocking
  flag with a full design, and the vague prompt raised a warning. The only
  degradation was validation-level: the first invocation needed 2 group-level
  assumption-coupling retries (one each on sc_04 and sc_05; a known v1.1-era error kind, not a new error kind);
  the capture rerun had 0 retries and 5/5 first-attempt schema-valid calls. v1.2
  wording was unchanged, the active prompt remains v1.1, no `selected_model` was
  set and `scored_run_approved` remains false.
- Scored v2 result (2026-11-26, nemotron-3.5-super-vl, `json_schema`, eval set v2.0
  `BD713F57...E2770E`, prompt v1.2 `EE6E94BF...3D2D`, 45 runs): **FAILED the
  pre-registered bar** on one criterion — **adversarial 2 of 3**. `ev2_14`
  failed the deterministic gate in 3 of 3 runs (`r01`, `r03`; optional blocking
  flag skipped). Deterministic gate 14/15; first-attempt schema-valid 42/45
  (bar met); blocking flags correct in both directions (required 2/2, forbidden
  0/12 violated, optional 1 skipped). Human scoring incomplete; mechanical
  verdict FAIL. No prompt/rubric/threshold/setting/evaluator change made; v2 not
  selected/frozen active; `scored_run_approved` and `selected_model` not set.

