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

## 3.0 — 26 November 2026 — held-out set v3.0, **frozen as versioned pair, not active**

Status: **frozen as a versioned pair with system prompt v1.3; not active**. SHA-256 `7B46B89744C7CE26BFBFF616546D7A5EDCAF1ABE29B6D4ADB876BD69ACB66141`. `eval_set_version: "3.0"`, ids `ev3_01` … `ev3_15`. The hash is recorded only in the versioned `eval_sets["3.0"]` block of `eval/freeze.json`; the active selector and top-level `eval_set_sha256` still point to v1.0, which remains frozen and unedited. v3.0 is paired with system prompt v1.3 (`A87CC5555D2BBF668FCDAB5EC112DDDFA2CC59D05AF8FA738BA5B29142E41CDB`) and is not scored until separately approved.

- 15 new prompts: 4 simple, 4 medium, 4 complex, 3 adversarial (1 contradiction, 1 vague, 1 impossible); same pass bar, thresholds, and shared settings as v1.0/v2.0.
- Derived from scored v2 failures under the Step 8 owner-approved evidence exception. v2 rubric/thresholds/settings/evaluators were not changed; v1.0/v2.0 remain historical scored sets and are not held-out for v1.3.
- **Independence limitation (disclosed):** independence is limited. The only independent reviewer is the product owner, who must read all 15 prompts and every rubric item before any v3 freeze. This is a required gate before scoring.
- **Reviewer input (disclosed):** the ev3_13 prompt text was suggested by the reviewer: "Design a message-delivery system with this requirement: \"A message must be delivered exactly once. The sender may never store a copy, and the receiver may be offline for days.\" Deliver a design."
- Rubric rules: v2 polarity (desired properties in `must_include`, including `no_reference_issues()` and `no_connection(from_type=client,to_type=database)`; violations in `must_not_include` as positive predicates; no `no_flag`/`no_component`); no must_not exclusion justified by a stated NFR (no queue/worker/cache/load balancer exclusions on ev3_05, ev3_08, ev3_11, ev3_12; each exclusion justified in notes from prompt text alone); at most 3 human items per prompt, each atomic; every prompt has a technology-label human item; `assumption_present` only on ev3_14 (top-level assumptions array, narrow prompt-justified token) plus pre-registered `component_count(lte=6)` not tuned after v3 results; blocking flag required for ev3_13/ev3_15, optional for ev3_14, forbidden for clean prompts; no single-topology predicates; same structural tests as v2 (4/4/4/3, categories, rubric minimums, predicate parsing, no prompt-text leak of own predicate vocab, no 8-word shingle with v1/v2/scratch).
- Single-shot protocol: v3.0 is held-out until the approved scored run. No provider calls, no `runs/` access during authoring, no freeze/run before product-owner review.
- **Reviewer-feedback rubric edits (26 November 2026, still unfrozen draft):** ev3_05 r01/r02 switched to `component_exists(type=service)` and `path_exists(from_type=service, to_type=database)`; ev3_13 x01 replaced `component_exists(type=object_storage)` with `component_exists(type=cdn)` and r02 switched `component_exists(type=client)` to `component_exists(type=service)`; ev3_12 x02 replaced `component_exists(type=external_service)` with `component_exists(type=auth_provider)` (no authentication requirement stated); ev3_14 x01 replaced deterministic CDN exclusion with human item "Any scalability component is justified by an assumption recorded in the assumptions array."; ev3_15 r01 statement set to "A blocking contradiction flag is present."; ev3_07 x01 statement set to "No external service is present although no requirement justifies one." Additional reviewer-feedback edits: ev3_06 r01/r02 switched to `component_exists(type=service)` and `path_exists(from_type=service, to_type=database)` (statements adjusted to service boundary / durable state from service); ev3_08 r01/r02 switched the same way; ev3_15 r02 switched from `component_exists(type=client)` to `component_exists(type=service)`. Reason: v1.3's client definition includes partner and external systems, so requiring `external_service` or `client` typing can fail a correct design. These edits followed reviewer feedback and are disclosed before any freeze/run.
