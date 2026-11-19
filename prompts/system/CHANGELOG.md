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

The provider's `GET /api/v1/key` reported 42 free-model requests used on
2026-11-19 (limit 50) after these calls. A 429 is stop-and-resume and was not
retried.

## 1.0 — 19 November 2026

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
  invalid, both assumption coupling (10 elements). After — not yet run;
  the v1.1 retest is pre-registered below and will be recorded here before
  any scored run.
- Pre-registered acceptance rule: v1.1 is kept if the assumption-coupling
  errors drop and no new error kind appears. If it is worse, revert to
  1.0 and report. No further prompt changes without user approval.

<!--
Format for a calibration revision:

## <version> — <date>

- Prompt: `prompts/system/architecture-v1.md`
- SHA-256: `<sha256 of the prompt after the change>`
- Scratch evidence: `<scratch prompt id(s)> and the observed defect`
- Change: `<what changed and why>`
- Before/after scratch result: `<before: observed result> -> <after: observed result>`
-->
