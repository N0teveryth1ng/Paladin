# Evaluation Set Changelog

The set is frozen when step 2 is approved. Every later change is recorded here
with its reason and the evidence that forced it.

## 1.0 — 12 November 2026 — initial set, **frozen** 12 November 2026

Status: **frozen**. SHA-256 `280E2E4145A2034BC73C213D59374BF94779666D3A25E407F5F60BB1F9C024DC`
(55,854 bytes), recorded in `eval/README.md`. No change is permitted without an
entry here, a version bump and a new hash.

- 15 prompts: 4 simple, 4 medium, 4 complex, 3 adversarial
  (1 contradiction, 1 vague, 1 impossible).
- Rubrics written from the failure definitions in project document §5, not
  from any model output.
- Deterministic predicates use the step 2 grammar, including `path_exists` for
  reachability that may traverse intermediate components; human items are capped at 3
  per prompt and include the fixed technology-realism item.
- Blocking-flag expectations: forbidden for clean prompts, required for the
  contradiction and impossible prompts, optional for the vague prompt.
- Prompt 11 scores the queue-only exactly-once claim through a human
  `must_not_include` item; the prompt text does not name the trap.
- Prompt texts state outcomes and constraints only. The adversarial prompts do
  not tell the model which conflict to detect.
- Pass protocol: 3 runs per prompt per model; 2-of-3 deterministic gate;
  set bar 13/15 prompts, all complex, all adversarial, 41/45 first-attempt
  schema-valid.

## 2.0 — 21 November 2026 — held-out set v2.0, **not active / not frozen**

Status: **draft, not active and not frozen**. SHA-256 `BD713F574A3C1EDFD6E450B38EF055B0AEEB18350CA62B1DB77DCC87F1E2770E`. `eval_set_version: "2.0"`. The hash is recorded only in the versioned `eval_sets["2.0"]` block of `eval/freeze.json`; the active selector and top-level `eval_set_sha256` still point to v1.0, which remains frozen and unedited. This set is not selected by default and is not scored until a v2 run is separately approved.

- 15 new prompts: 4 simple, 4 medium, 4 complex, 3 adversarial
  (1 contradiction, 1 vague, 1 impossible); same pass bar and thresholds as v1.0.
- STEP 7 REVISION REVIEW changes: a polarity cleanup across the rubrics
  (blocking-flag and predicate polarity made explicit, `no_flag`/`no_component`
  removed, positive-exclusion items moved to `must_not_include`), human
  conversions for outcome-based judgments a type-pair predicate cannot express,
  and the reviewer-supplied replacement of `ev2_13` with "Global meeting-room
  booking with partition tolerance". The `ev2_13` prompt text came verbatim
  from reviewer input; `blocking_flag_expected: "required"` and its
  deterministic structure were retained (disclosed in
  `docs/prompts/step-7-prompt-v1.2-and-eval-v2.md` §6.0).
- Authoring-independence controls and the three v1.0 rubric defects as
  history-only lessons are recorded in §6.0 and §8 of that document.

## 2.0 — 26 November 2026 — scored v2 run, **FAILED pre-registered bar**

Status: **scored, failed**. v2.0 remained held-out/draft; it was not frozen as the active eval set. The scored run used `eval/eval_set_v2.json` (v2.0, `BD713F57...E2770E`) with `prompts/system/architecture-v1.2.md` (v1.2, `EE6E94BF...3D2D`) for `nemotron-3.5-super-vl`, `json_schema`, fixed `max_tokens` 32768, 3 runs/prompt, 45 runs total. No rubric, threshold, prompt, setting or evaluator was changed after the run.

- **Mechanical verdict: FAIL** on one pre-registered criterion: **adversarial 2 of 3**.
- **Deterministic gate:** 14 of 15 prompts passed (2-of-3). `ev2_14` failed the deterministic gate in **3 of 3 runs** (failed items `r01`, `r03` each run); `blocking_flag_rule` was `optional_skipped` in all 3 runs.
- **First-attempt schema-valid:** 42 of 45 (bar 41/45 met).
- **Blocking flags:** correct in both directions — required present 2/2 (`ev2_13`, `ev2_15`), forbidden violated 0/12, optional skipped 1 (`ev2_14`).
- **Human scoring:** incomplete; no verdict beyond the mechanical FAIL.
- **Disposition:** v2.0 is not selected and not frozen active. `scored_run_approved` and `selected_model` were not set. Any further prompt/rubric tuning requires a new held-out v3 set; v2 items/thresholds are unchanged.
