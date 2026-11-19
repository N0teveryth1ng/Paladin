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

<!--
Format for a calibration revision:

## <version> — <date>

- Prompt: `prompts/system/architecture-v1.md`
- SHA-256: `<sha256 of the prompt after the change>`
- Scratch evidence: `<scratch prompt id(s)> and the observed defect`
- Change: `<what changed and why>`
- Before/after scratch result: `<before: observed result> -> <after: observed result>`
-->
