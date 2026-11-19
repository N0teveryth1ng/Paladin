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
