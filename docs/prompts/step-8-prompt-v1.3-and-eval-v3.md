# Step 8: Prompt v1.3 proposal and eval v3.0 held-out set

Status: **draft v2 for review**. No code, prompt file, rubric, threshold, setting, or evaluator was changed to produce this document. No provider calls were made. `runs/` was not opened while authoring the v3 plan.

## 0. Why this exists

The scored v2 run (2026-11-26, `nemotron-3.5-super-vl`, `json_schema`, eval set v2.0 `BD713F57...E2770E`, prompt v1.2 `EE6E94BF...3D2D`, 45 runs) **failed the pre-registered bar** on one criterion: **adversarial 2 of 3**.

- Deterministic gate: 14/15 (ev2_14 failed 3/3 on `r01`, `r03`; `blocking_flag_rule` optional/skipped in all 3 runs).
- First-attempt schema-valid: 42/45 (bar met).
- Blocking flags: correct in both directions (required 2/2, forbidden 0/12 violated, optional 1 skipped).
- Human scoring: incomplete; mechanical verdict FAIL.

v2 is not selected, not frozen active, and not edited. Any further prompt/rubric tuning requires a new held-out v3 set.

## 1. PROPOSED v1.3 wording (generic only; no prompt file changes yet)

### 1.1 Final exact v1.3 text

The v1.3 rule is placed **once** in `## Assumptions and traceability`. `## Minimal, justified structure` gets a one-line cross-reference only.

**Exact text to insert in `## Assumptions and traceability`:**

> Assumptions about unstated quantities, definitions, or choices must be recorded as entries in the top-level `assumptions` array, not only in flags or rationales. When a prompt is vague, state the assumed quantity, such as scale, users, or budget, as an assumption entry, and justify any scalability component against that stated assumption. Do not add generic scalability or modernity components that no stated requirement or stated assumption needs.

**Exact cross-reference to insert in `## Minimal, justified structure`:**

> For unstated quantities and vague prompts, follow the assumption-placement and justification rule in `## Assumptions and traceability`.

### 1.2 Conflict resolution with "do not omit a necessary component"

The existing rule "Do not omit a component that a stated requirement makes necessary" remains unchanged. The v1.3 rule does not relax it. When a prompt is vague, the model may make an explicit assumption (for example, scale/users/budget) and record it in the top-level `assumptions` array; a scalability component is allowed only when it is justified against a stated requirement or that stated assumption. Generic scalability or modernity components with no such justification remain disallowed.

### 1.3 Clean diff against v1.2

```diff
diff --git a/prompts/system/architecture-v1.2.md b/prompts/system/architecture-v1.3.md
--- a/prompts/system/architecture-v1.2.md
+++ b/prompts/system/architecture-v1.3.md
@@ -1,4 +1,4 @@
-# Architecture generation — system prompt v1.2
+# Architecture generation — system prompt v1.3
 
 You are a system-design assistant. Given a product prompt, you return exactly one
 JSON object that satisfies the supplied JSON Schema. Return no prose, no markdown,
@@ -15,10 +15,11 @@
 that a stated requirement makes necessary.
 
 An assumption about an unstated quantity or definition — such as the number of
 users, the budget, or the meaning of a vague term — remains allowed and must be
 stated as an assumption. The restriction in this section applies only to adding
 components or infrastructure that the stated requirements do not need. Do not
 add components for needs the prompt did not state.
+For unstated quantities and vague prompts, follow the assumption-placement and justification rule in `## Assumptions and traceability`.
 
 ## Connection types
 
@@
 ## Assumptions and traceability
 
 The schema separates requirement traceability from assumptions:
 
 - `assumed: false` — `requirement_refs` must be a non-empty list of requirement
   identifiers that the element implements.
 - `assumed: true` — `rationale` must be a non-empty sentence explaining the
   assumption. An assumption with no stated reason is invalid.
 
+Assumptions about unstated quantities, definitions, or choices must be recorded as entries in the top-level `assumptions` array, not only in flags or rationales. When a prompt is vague, state the assumed quantity, such as scale, users, or budget, as an assumption entry, and justify any scalability component against that stated assumption. Do not add generic scalability or modernity components that no stated requirement or stated assumption needs.
+
 Choose one form for each element: cite a requirement, or state an assumption.
 An assumption that is not stated is a defect. Do not hide a decision in a name.
```

### 1.4 Changelog / provenance note

The v1.3 prompt changelog entry must state that **v1.3 was derived from scored v2 failures** (specifically the ev2_14 mechanical gate failure: over-engineering/generic scalability add-ons and scale assumptions expressed outside the `assumptions` array), while remaining generic and not naming eval ids or domains in the prompt text.

### 1.5 Leak-guard confirmation plan

Before v1.3 is implemented/frozen:

- Existing v1.0 and v2 leak-guard tests must still pass unchanged.
- v3 must get equivalent leak guards: prompt text must not contain v1/v2 prompt ids, v2 failure item ids, or v3 rubric answer keys; no eval prompt text may be copied into scratch or prompt files.
- The v1.3 prompt text must be checked for domain leakage (no `ev2_14`, no loyalty/points/retailer, no v2-specific component names). A simple grep/substring guard should be added alongside existing prompt-version tests.
- v1.0 and v2 run records/hashes remain untouched.

## 2. NEW held-out set v3.0 (revised concepts)

### 2.1 Scope

- New file: `eval/eval_set_v3.json`, `eval_set_version: "3.0"`, ids `ev3_01`–`ev3_15`.
- 15 fresh prompts, domains different from v1, v2, and scratch.
- Same counts: 4 simple, 4 medium, 4 complex, 3 adversarial (1 contradiction, 1 vague, 1 impossible).
- Same pass bar and thresholds as v1.0/v2.0. No threshold changes.
- v3 is scored only with v1.3 once v1.3 is approved and a scratch check passes.

### 2.2 Rubric lessons built in

| Lesson | v3 rule |
|---|---|
| Polarity | Same as v2: `must_include` fails when predicate false; `must_not_include` fails when predicate true. No `no_flag`. Positive `component_exists` exclusions appear only in `must_not_include` with `statement` describing an unwanted property. |
| NFR-justified exclusions | No `must_not_include` item may exclude a component that a stated non-functional need could justify. Every exclusion must be justified from prompt text in `notes`. |
| Assumption predicates | No `assumption_present` predicate for facts the prompt already states. Any `assumption_present` predicate must check the assumptions array for a **stated-quantity/definition/choice topic** that is explicitly unstated in the prompt, and the `notes` field must justify why that topic is unstated. Use a narrow prompt-justified token, or no assumption predicate. |
| Vague/component_count | `component_count` only on the vague adversarial prompt, with a written justification in `notes` derived from the prompt text alone. No other numeric component limit. |
| Human items | At most 3 human items per prompt. Each human item is atomic (one claim). Human `must_not_include` statements are written as desired properties; pass means statement is true of the design. |
| Blocking flags | Forbidden for clean prompts, required for contradiction and impossible, optional for vague. |
| Deterministic preference | Keep deterministic items where a predicate can express the claim without encoding topology; use human items for outcomes/properties predicates cannot prove. |

### 2.3 Revised v3 concept table (text only, no rubrics yet)

At least four prompts call for architecture shapes beyond request/record/conflict-check: **ev3_05** (batch ingestion/aggregation/reporting), **ev3_06** (long-running document-signing workflow + external integration), **ev3_08** (fan-out bulk notification + external integrations), **ev3_12** (streaming sensor ingestion + durable history/latest state + alert fan-out). ev3_13 is an adversarial contradiction and is not counted as a normal architecture-shape exemplar.

| Id | Category | Domain | Draft prompt concept (text only) | Architecture shape | Nearest v1/v2/scratch prompt | Why it differs |
|---|---|---|---|---|---|---|
| ev3_01 | simple | Municipal pothole reporting | Design a system for residents of one city to report potholes. A resident submits a location, photo, and description; city staff can view reports and mark them repaired. Reports must remain durable after submission. Assume one city and modest volume. | Simple request/record workflow with staff status update | v2 `ev2_04` Campus parking permit renewal (simple record submission/review) | Different domain (civic issue reporting) and different object lifecycle (public report to staff repair status), not a booking/reservation/permit-renewal flow. |
| ev3_02 | simple | School club attendance register | Design an attendance register for after-school clubs at one school. A teacher records which students attended a session; staff can review past attendance by club and date. Attendance records must be durable. Assume one school and a small number of clubs. | Simple record capture and query | v2 `ev2_01` Public library loan desk (simple durable records) | Different domain (school attendance) and no inventory/loan limit or return cycle; plain session attendance records. |
| ev3_03 | simple | Pet vaccination reminder service | Design a service for a veterinary clinic to remind owners about upcoming pet vaccinations. Staff record pets, vaccine dates, and due dates; the system sends a reminder before a due date. Reminder schedules and vaccination records must be durable. Assume one clinic. | Simple record + scheduled reminder trigger | v1 `ev_03` Background email sender (simple background delivery) | Different domain (clinic vaccination schedules) and combines durable due-date records with scheduled reminder generation, not a generic email sender. |
| ev3_04 | simple | Community tool-lending checkout | Design a checkout system for a community tool-lending library. Members borrow tools, return them, and staff can see overdue items. A tool cannot be checked out to two members at the same time. Assume one location and modest inventory. | Simple checkout/return state machine | v2 `ev2_01` Public library loan desk (loan/return records) | Different domain (physical tools) and explicit single-copy checkout conflict; no patron loan limit or desk workflow beyond overdue visibility. |
| ev3_05 | medium | Monthly energy-usage batch reporting | Design a system that produces monthly energy-usage reports for property managers. Daily meter readings arrive as files from an external utility provider; the system validates them, stores them durably, aggregates monthly totals per property, and generates a report after month end. Late corrections for a prior day may arrive and must be reflected in the next report run. Assume thousands of meters. | Batch file ingestion + validation + aggregation + scheduled report generation | v1 `ev_07` Search with index synchronisation (background sync) | Different domain (utility meter reporting) and batch/file-oriented aggregation with late corrections and scheduled report runs, not request/record search indexing. |
| ev3_06 | medium | Vendor contract document-signing workflow | Design a document-signing workflow for vendor contracts. A procurement user creates a contract, sends it to an external e-signature provider for signature, tracks pending/signed/declined state, and stores the signed artifact durably. The contract must not be marked signed until the provider confirms completion. Assume modest contract volume. | Long-running workflow with external integration and state transitions | v1 `ev_06` Event-driven order pipeline with retries (async workflow) | Different domain (legal/procurement signing) and long-running external callback/poll workflow with durable signed artifact, not an internal order/event pipeline or record-conflict workflow. |
| ev3_07 | medium | Charity auction bid settlement | Design the settlement system for an online charity auction. Bidders place bids during an auction window; when the auction closes, the winning bid is settled through an external payment provider. Bids and settlement outcomes must be durable, and an auction must not settle twice. Assume one auction at a time with moderate traffic. | Time-window state transition + external payment integration | v1 `ev_05` Microservices e-commerce checkout (payment workflow) | Different domain (charity auction settlement) and single-auction close/settle transition with no cart/catalog/microservice checkout sprawl. |
| ev3_08 | medium | School closure bulk notification system | Design a system that sends school-closure alerts to parents. Administrators publish a closure notice; the system fans out notifications by email and SMS through external providers, records delivery attempts, and avoids sending the same notice twice to the same recipient. Assume thousands of recipients per notice. | Fan-out bulk notification with external integrations and idempotent delivery tracking | v1 `ev_03` Background email sender (single-channel background send) | Different domain (emergency school notices) and multi-channel fan-out with per-recipient dedup/delivery tracking, not a simple single background sender or record/conflict workflow. |
| ev3_09 | complex | Blood-donation appointment and deferral windows | Design appointment scheduling for a blood-donation center. Donors book appointments, but a donor who has a recorded deferral window must not be booked inside that window. Appointments and deferral records must be durable. Staff can cancel appointments and update deferral windows. Assume several centers and high day-to-day volume. | Rule-constrained scheduling with durable eligibility windows | v2 `ev2_05` University course registration with prerequisites and waitlists (rule-constrained enrollment) | Different domain (donor eligibility/deferral) and time-window eligibility constraint; no waitlist auto-enrollment or course/section model. |
| ev3_10 | complex | Harbour berth allocation with tide windows | Design berth allocation for a small harbour. A vessel requests a berth for an arrival window; the system assigns a compatible berth only when tide and berth availability allow it. Allocations must be durable, and the same berth must not be assigned to overlapping vessel windows. Assume one harbour and many daily requests. | Constraint-based resource allocation over time windows | v2 `ev2_09` Farm equipment reservation calendar (resource reservation calendar) | Different domain (maritime berth/tide constraints) and adds compatibility/tide-window constraints beyond simple calendar conflict checks. |
| ev3_11 | complex | Disaster shelter occupancy and supply tracking | Design a system for emergency shelters to track occupancy and critical supplies. Staff record intake, departure, and bed assignments; supply counts are updated as items are consumed or restocked. A shelter must not exceed its bed capacity, and occupancy/supply records must be durable during an active incident. Assume multiple shelters and intermittent connectivity to a central office. | Operational state tracking with capacity invariants and intermittent-sync tolerance | v1 `ev_12` Real-time chat at 50k concurrent connections (high-concurrency realtime) | Different domain (emergency shelter operations) and capacity/inventory invariants with intermittent connectivity concerns, not high-concurrency chat or simple record conflict checking. |
| ev3_12 | complex | Water-quality sensor ingestion and alerting pipeline | Design a pipeline for water-quality sensors deployed across a region. Sensors send readings continuously; the system ingests readings, tolerates duplicates and out-of-order arrival, stores durable history, maintains latest per-sensor state, and raises alerts when thresholds are breached. Assume thousands of sensors and bursty reconnects. | Streaming ingestion + dedup/latest-state + durable history + alert fan-out | scratch `sc_02` Sensor telemetry intake (streaming intake) and v1 `ev_06` Event-driven order pipeline (async processing) | Different domain (water quality/compliance alerting) and combines streaming ingestion, durable history, latest-state view, and threshold alerting; not only intake/storage and not a request/record workflow. |
| ev3_13 | adversarial / contradiction | Exactly-once delivery with no sender copy and offline receiver | Design a message-delivery system with this requirement: "A message must be delivered exactly once. The sender may never store a copy, and the receiver may be offline for days." Produce a design that satisfies the requirement as stated. | Adversarial contradiction (logically airtight) | v1 `ev_13` Contradiction: single region and region-loss survival (adversarial contradiction) | Different domain (message delivery guarantees) and a different logical impossibility: exactly-once delivery cannot be guaranteed without sender/receiver/broker state while the receiver may be offline for days. **Suggested by the reviewer.** |
| ev3_14 | adversarial / vague | Volunteer coordination thing | Design our new volunteer coordination thing. It should be helpful, modern, and work for the organization as it grows. We have not decided what activities volunteers do, who approves them, or how big the organization is. Make reasonable assumptions and give us something we can discuss. | Vague/minimal discussable design | v1 `ev_14` Vague: scale, cheap, and AI (vague adversarial) and v2 `ev2_14` Loyalty thing (vague adversarial) | Different domain (volunteer coordination) and vague in organization/activity/approval/scale dimensions; no AI/cheap/loyalty framing. |
| ev3_15 | adversarial / impossible | Real-time evacuation route with no connectivity and mandatory central live coordination | Design a real-time evacuation routing system for a disaster zone. Evacuees' devices have no network connectivity, but every route update must be centrally coordinated and delivered to all evacuees in real time. Produce a design that satisfies the requirement as stated. | Adversarial impossible/contradictory requirements | v1 `ev_15` Impossible: global strong consistency under 10 ms at zero cost (impossible adversarial) | Different domain (evacuation routing) and a different impossibility: no connectivity conflicts with mandatory central real-time delivery/coordination. |

### 2.4 ev3_14 component_count limit (written now, before any v3 output exists)

For **ev3_14 only**, the draft deterministic rubric will include:

- `r01` `component_count(lte=6)` — **must_include / deterministic**.
- **Justification from prompt text:** The prompt states only "volunteer coordination thing" and gives no concrete activities, approval owner, data flows, integrations, or scale target. The only defensible minimum for a discussable design is one volunteer-facing client boundary, one coordination service, and one durable store (3 components). Up to three additional components may be justified only by explicitly stated assumptions in the top-level `assumptions` array (for example, an assumed notification channel, an assumed auth provider, or an assumed staff/admin boundary). Anything beyond 6 would be generic "modern/grows" infrastructure not required by the prompt text or a stated assumption. This limit is prompt-text-justified and must be recorded in the rubric `notes`.

No other v3 prompt will use `component_count`.

## 3. Independence controls and disclosure

The author of this draft has seen v1 and v2 scored outcomes, including ev2_14's gate failures (`r01`, `r03`) and the diagnosis. That knowledge is used only for generic rubric/process lessons listed above.

**Controls / gates:**

- Do not open `runs/` while authoring v3 prompt/rubric text.
- Do not copy v1/v2 prompt text, rubric statements, ids, or failure-derived component names into v3.
- Domain freshness check: every v3 domain/concept must be absent from v1, v2, and scratch prompt lists.
- Predicate/form review: every assumption predicate justified from prompt text; no predicate targets a fact already stated.
- **Independent review gate:** The only independent reviewer is the product owner, who will read all 15 prompts and every rubric item in full before any freeze. v3 may not be frozen until this review is complete.
- Single-shot: first scored v3 run is the only scored v3 run per model.

**Disclosure:**

> **Independence is limited.** Because v2 failures were observed, v3 cannot be treated as fully blind. The only independent reviewer is the product owner, who will read all 15 prompts and every rubric item in full before any freeze. This limitation and the review gate must be disclosed in the v3 doc/changelog and considered when interpreting a pass.

## 4. Single-shot and three-version handling plan

**Single-shot protocol:**

- v3 is single-shot per model, same as v2. A v3 failure requires a new held-out v4 for further tuning.

**Three-version handling:**

- `eval/freeze.json` gains `eval_sets["3.0"]` and `system_prompts["1.3"]` entries; active top-level selectors remain v1.0/v1.1 until a separate promotion decision.
- Runner: extend version maps/choices to include `3.0 -> 1.3` (no behavior change to v1/v2 paths). `--eval-set-version 3.0` writes `eval_set_version: "3.0"` and the v1.3 prompt hash in records.
- Report: `--eval-set-version 3.0` writes under `runs/v3/`.
- READMEs/changelog: document v3 as held-out draft until approved/scored; keep v1.0 as frozen history and v2.0 as scored-failed history.

## 5. Scratch check plan with call budget

- **When:** different day from the v3 scored run.
- **Scope:** `scratch/scratch_prompts.json` only, 5 prompts, `nemotron-3.5-super-vl`, `json_schema`, v1.3, fixed `max_tokens` 32768.
- **Budget:** one redacted `GET /api/v1/key` check (0 calls) + 5 calls plus at most 1 retry/prompt = max 10 calls; call cap `remaining - 2`. Do not run if remaining < 12.
- **Stop rule:** 429 is stop-and-resume, never retry. `IncompleteRead`: rerun same command and report.
- **Evidence:** structural regression only; record date, slug, mode, calls, first-attempt schema-valid, retries, finish reasons, output tokens, latency, component count, flags, unrequested components, app typed as `service`.
- **No eval prompts, no v3 prompts, no scored run.**

## 6. Decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Accept v1.3 wording? | **Yes**, with the rewrite in item 1: clean capitalized sentences, placed once in Assumptions and traceability, one-line cross-reference from Minimal, justified structure, conflict with "do not omit a necessary component" resolved. |
| 2 | Where to place assumption-array rule? | **Once only**, in `## Assumptions and traceability`; Minimal, justified structure gets a cross-reference. |
| 3 | v3 concept set? | **Approved** with item 2 and 3 changes (ev3_01 replaced; ev3_06/ev3_08/ev3_12 replaced with different architecture shapes; ev3_13 replaced with reviewer-suggested airtight contradiction). |
| 4 | Assumption predicate token policy? | **Yes** — narrow prompt-justified token, or no assumption predicate. |
| 5 | v3 independence disclosure? | **Yes** — independence limited; product owner is the only independent reviewer and must read all 15 prompts and every rubric item in full before freeze. |
| 6 | Runner/report version plumbing? | **Yes** — additive version support only; no default change. |
| 7 | Next execution gate? | **Yes** — after review approval, implement v1.3 prompt file + tests/docs, author v3 eval set + tests/docs, run 5-call v1.3 scratch check on a different day, then request approval for single-shot v3 scored run. |

## 7. Non-actions

- No v2 edit.
- No threshold change.
- No `scored_run_approved` or `selected_model` change.
- No provider calls.
- No code/prompt file/eval file implementation in this step.
- No `runs/` opened.

*End of draft v2. Stop for review.*
