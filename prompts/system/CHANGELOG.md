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
- Scratch evidence: none yet. A 5-call structural regression check on the
  scratch prompts is planned on a day different from the v2 scored run.
- Before/after scratch result: pending; the check has not been run. No provider
  call was made to produce this entry.

<!--
Format for a calibration revision:

## <version> — <date>

- Prompt: `prompts/system/architecture-v1.md`
- SHA-256: `<sha256 of the prompt after the change>`
- Scratch evidence: `<scratch prompt id(s)> and the observed defect`
- Change: `<what changed and why>`
- Before/after scratch result: `<before: observed result> -> <after: observed result>`
-->
