# Step 8: Prompt v1.3 proposal and eval v3.0 held-out set

Status: **draft for review**. No code, prompt, rubric, threshold, setting or evaluator was changed to produce this document. No provider calls were made. `runs/` was not opened while authoring the v3 plan.

## 0. Why this exists

The scored v2 run (2026-11-26, `nemotron-3.5-super-vl`, `json_schema`, eval set v2.0 `BD713F57...E2770E`, prompt v1.2 `EE6E94BF...3D2D`, 45 runs) **failed the pre-registered bar** on one criterion: **adversarial 2 of 3**.

- Deterministic gate: 14/15 (ev2_14 failed 3/3 on `r01`, `r03`; `blocking_flag_rule` optional/skipped in all 3 runs).
- First-attempt schema-valid: 42/45 (bar met).
- Blocking flags: correct in both directions (required 2/2, forbidden 0/12 violated, optional 1 skipped).
- Human scoring: incomplete; mechanical verdict FAIL.

v2 is not selected, not frozen active, and not edited. Any further prompt/rubric tuning requires a new held-out v3 set.

## 1. PROPOSED v1.3 wording (generic only; no prompt text changes yet)

### 1.1 Exact text to add

The following text is proposed verbatim for v1.3:

> assumptions about unstated quantities, definitions or choices must be emitted as entries in the assumptions array (not only in flags or rationales); for vague prompts, deliver the smallest design the stated needs justify and state what was assumed; do not add generic scalability or modernity components unless a stated requirement needs them.

### 1.2 Placement

- The first clause extends the existing assumption rule in **Minimal, justified structure** / **Assumptions and traceability** so assumptions are not only expressed in flags/rationales.
- The second and third clauses extend **Minimal, justified structure** for vague prompts, without adding domain-specific rules or naming ev2_14.

### 1.3 Exact diff against v1.2

```diff
diff --git a/prompts/system/architecture-v1.2.md b/prompts/system/architecture-v1.3.md
index 4b2e3b6..0000000 100644
--- a/prompts/system/architecture-v1.2.md
+++ b/prompts/system/architecture-v1.3.md
@@ -1,4 +1,4 @@
-# Architecture generation — system prompt v1.2
+# Architecture generation — system prompt v1.3
 
 You are a system-design assistant. Given a product prompt, you return exactly one
 JSON object that satisfies the supplied JSON Schema. Return no prose, no markdown,
@@ -17,8 +17,12 @@
 An assumption about an unstated quantity or definition — such as the number of
 users, the budget, or the meaning of a vague term — remains allowed and must be
-stated as an assumption. The restriction in this section applies only to adding
-components or infrastructure that the stated requirements do not need. Do not
-add components for needs the prompt did not state.
+stated as an assumption. assumptions about unstated quantities, definitions or
+choices must be emitted as entries in the assumptions array (not only in flags
+or rationales); for vague prompts, deliver the smallest design the stated needs
+justify and state what was assumed; do not add generic scalability or modernity
+components unless a stated requirement needs them. The restriction in this
+section applies only to adding components or infrastructure that the stated
+requirements do not need. Do not add components for needs the prompt did not
+state.
 
 ## Connection types
 
@@ -66,7 +70,9 @@
 - `assumed: true` — `rationale` must be a non-empty sentence explaining the
   assumption. An assumption with no stated reason is invalid.
 
-Choose one form for each element: cite a requirement, or state an assumption.
+Choose one form for each element: cite a requirement, or state an assumption.
+Any assumption about an unstated quantity, definition or choice must also appear
+as an entry in the top-level `assumptions` array, not only in flags or
+rationales.
 An assumption that is not stated is a defect. Do not hide a decision in a name.
```

Notes:
- The diff is **proposed**; `prompts/system/architecture-v1.3.md` is not created by this draft.
- The inserted text is verbatim as requested. If we want to normalize capitalization/punctuation before implementation, that is a review decision; as drafted, the exact requested string appears.
- No domain, no eval prompt id, and no v2 failure artifact is named in the prompt text.

### 1.4 Leak-guard confirmation requirement

Before v1.3 is implemented/frozen:

- Existing v1.0 and v2 leak-guard tests must still pass unchanged.
- v3 must get equivalent leak guards: prompt text must not contain v1/v2 prompt ids, v2 failure item ids, or v3 rubric answer keys; no eval prompt text may be copied into scratch or prompt files.
- The v1.3 prompt text must be checked for domain leakage (no ev2_14, no loyalty/points/retailer, no v2-specific component names). A simple grep/substring guard should be added alongside existing prompt-version tests.
- v1.0 and v2 run records/hashes remain untouched.

## 2. NEW held-out set v3.0

### 2.1 Scope

- New file: `eval/eval_set_v3.json`, `eval_set_version: "3.0"`, ids `ev3_01`–`ev3_15`.
- 15 fresh prompts, domains different from v1, v2 and scratch.
- Same counts: 4 simple, 4 medium, 4 complex, 3 adversarial (1 contradiction, 1 vague, 1 impossible).
- Same pass bar and thresholds as v1.0/v2.0. No threshold changes.
- v3 is scored only with v1.3 once v1.3 is approved and a scratch check passes.

### 2.2 Rubric lessons built in

| Lesson | v3 rule |
|---|---|
| Polarity | Same as v2: `must_include` fails when predicate false; `must_not_include` fails when predicate true. No `no_flag`. Positive `component_exists` exclusions appear only in `must_not_include` with `statement` describing an unwanted property. |
| NFR-justified exclusions | No `must_not_include` item may exclude a component that a stated non-functional need could justify. Every exclusion must be justified from prompt text in `notes`. |
| Assumption predicates | No `assumption_present` predicate for facts the prompt already states. Any `assumption_present` predicate must check the assumptions array for a **stated-quantity/definition/choice topic** that is explicitly unstated in the prompt, and the `notes` field must justify why that topic is unstated. Avoid broad tokens that can be satisfied by incidental text; prefer a narrow, prompt-justified token/topic. |
| Vague/component_count | `component_count` only on the vague adversarial prompt, with a written justification in `notes` derived from the prompt text alone. No other numeric component limit. |
| Human items | At most 3 human items per prompt. Each human item is atomic (one claim). Human `must_not_include` statements are written as desired properties; pass means statement is true of the design. |
| Blocking flags | Forbidden for clean prompts, required for contradiction and impossible, optional for vague. |
| Deterministic preference | Keep deterministic items where a predicate can express the claim without encoding topology; use human items for outcomes/properties predicates cannot prove. |

### 2.3 Domain/independence plan

Candidate domains (to be finalized during authoring; all must differ from v1, v2 and scratch): municipal permit inspections, seed-bank inventory lending, laboratory sample chain-of-custody, public transit lost-and-found, charity auction settlements, community radio playlist scheduling, wildfire equipment check-out, court interpreter scheduling, museum loan condition reporting, school cafeteria allergen substitutions, harbour berth allocation, blood-donation appointment reminders, disaster shelter occupancy, property tax appeal filings, energy-meter dispute resolution. Final selection must be checked against v1/v2/scratch domain lists before freezing.

### 2.4 Proposed v3 prompt inventory (for review)

| Id | Category | Draft concept | Blocking flag | Notes |
|---|---|---|---|---|
| ev3_01 | simple | Public library meeting-room reservations | forbidden | Clean; durable reservation state; no double booking left to client. |
| ev3_02 | simple | School club attendance register | forbidden | Clean; durable attendance record; staff boundary. |
| ev3_03 | simple | Pet vaccination reminder service | forbidden | Clean; schedule/reminder path; durable pet/vaccine record. |
| ev3_04 | simple | Community tool-lending checkout | forbidden | Clean; durable checkout state; return/overdue visible. |
| ev3_05 | medium | Laboratory sample chain-of-custody | forbidden | Append-only/event history judged carefully; durable custody trail. |
| ev3_06 | medium | Municipal permit inspection scheduling | forbidden | Inspector assignment and inspection outcome durable; no double assignment. |
| ev3_07 | medium | Charity auction bid settlement | forbidden | Bids/settlement durable; payment external; no premature settlement. |
| ev3_08 | medium | Public transit lost-and-found matching | forbidden | Item reports/claims durable; staff verification boundary. |
| ev3_09 | complex | Blood-donation appointment and deferral windows | forbidden | Deferral/eligibility window durable; no booking inside deferral. |
| ev3_10 | complex | Harbour berth allocation with tide windows | forbidden | Allocation durable; conflicting berth/time assignment prevented. |
| ev3_11 | complex | Disaster shelter occupancy and supply tracking | forbidden | Occupancy durable; intake/update boundaries; no over-allocation of beds. |
| ev3_12 | complex | Court interpreter assignment with conflict checks | forbidden | Assignment durable; conflict check before confirmation. |
| ev3_13 | adversarial/contradiction | Property records: public access and sealed-record legal hold | required | Contradiction stated in outcomes, not named as trap. |
| ev3_14 | adversarial/vague | "Volunteer coordination thing" | optional | Vague; `component_count` only here with prompt-text justification; assumptions array required for unstated choices. |
| ev3_15 | adversarial/impossible | Real-time evacuation route with no connectivity and mandatory central live coordination | required | Impossible/contradictory requirements; blocking flag required. |

These are draft concepts for review only; rubric items, predicates, notes and leak checks are not yet authored.

## 3. Independence controls and limitation

The author of this draft has seen v1 and v2 scored outcomes, including ev2_14's gate failures (`r01`, `r03`) and the diagnosis. That knowledge is used only for generic rubric/process lessons listed above.

Controls:
- Do not open `runs/` while authoring v3 prompt/rubric text.
- Do not copy v1/v2 prompt text, rubric statements, ids, or failure-derived component names into v3.
- Domain freshness check: every v3 domain/concept must be absent from v1, v2 and scratch prompt lists.
- Predicate/form review: every assumption predicate justified from prompt text; no predicate targets a fact already stated.
- Reviewer pass: a reviewer who has not seen the v3 draft's target failure mapping checks for leakage/overfitting.
- Single-shot: first scored v3 run is the only scored v3 run per model.

**Independence is limited.** Because v2 failures were observed, v3 cannot be treated as fully blind. This limitation must be disclosed in the v3 doc/changelog and considered when interpreting a pass.

## 4. Single-shot protocol and harness/version handling

- v3 is single-shot per model, same as v2. A v3 failure requires a new held-out v4 for further tuning.
- `eval/freeze.json` gains `eval_sets["3.0"]` and `system_prompts["1.3"]` entries; active top-level selectors remain v1.0/v1.1 until a separate promotion decision.
- Runner: extend version maps/choices to include `3.0 -> 1.3` (no behavior change to v1/v2 paths). `--eval-set-version 3.0` writes `eval_set_version: "3.0"` and v1.3 prompt hash in records.
- Report: `--eval-set-version 3.0` writes under `runs/v3/`.
- READMEs/changelog: document v3 as held-out draft until approved/scored; keep v1.0 as frozen history and v2.0 as scored-failed history.

## 5. v1.3 scratch check plan

- **When:** different day from the v3 scored run.
- **Scope:** `scratch/scratch_prompts.json` only, 5 prompts, `nemotron-3.5-super-vl`, `json_schema`, v1.3, fixed `max_tokens` 32768.
- **Budget:** one redacted `GET /api/v1/key` check (0 calls) + 5 calls plus at most 1 retry/prompt = max 10 calls; call cap `remaining - 2`. Do not run if remaining < 12.
- **Stop rule:** 429 is stop-and-resume, never retry. `IncompleteRead`: rerun same command and report.
- **Evidence:** structural regression only; record date, slug, mode, calls, first-attempt schema-valid, retries, finish reasons, output tokens, latency, component count, flags, unrequested components, app typed as `service`.
- **No eval prompts, no v3 prompts, no scored run.**

## 6. Decisions for review

1. **Accept v1.3 wording as-is?** The exact requested string is included; capitalization/punctuation normalization before implementation is optional.
2. **Where to place the assumption-array rule?** Draft diff adds it in both Minimal/justified structure and Assumptions/traceability for redundancy; reviewer may prefer one location.
3. **v3 concept set:** approve/replace the 15 draft concepts above before rubric authoring.
4. **Assumption predicate token policy:** narrow prompt-justified topic token only; no broad "scal" unless prompt text itself makes that token unavoidable and justified in notes.
5. **v3 independence disclosure:** accept the explicit "independence limited" statement in v3 docs/changelog.
6. **Runner/report version plumbing:** implement v3 as additive version support only; no default change.
7. **Next execution gate:** after review approval, implement v1.3 prompt file + tests/docs, author v3 eval set + tests/docs, run 5-call v1.3 scratch check on a different day, then request approval for single-shot v3 scored run.

## 7. Non-actions

- No v2 edit.
- No threshold change.
- No `scored_run_approved` or `selected_model` change.
- No provider calls.
- No code/prompt/rubric implementation in this step.

*End of draft. Stop for review.*