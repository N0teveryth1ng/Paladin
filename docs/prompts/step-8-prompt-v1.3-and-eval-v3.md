# Step 8: Prompt v1.3 proposal and eval v3.0 held-out set

Status: **draft v3 for review**. No code, prompt file, rubric, threshold, setting, or evaluator was changed to produce this document. No provider calls were made. `runs/` was not opened while authoring the v3 plan.

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

**Exact cross-reference to insert in `## Minimal, justified structure` (own paragraph, blank line before it):**

> For unstated quantities and vague prompts, follow the assumption-placement and justification rule in `## Assumptions and traceability`.

### 1.2 Conflict resolution with "do not omit a necessary component"

The existing rule "Do not omit a component that a stated requirement makes necessary" remains unchanged. The v1.3 rule does not relax it. When a prompt is vague, the model may make an explicit assumption (for example, scale/users/budget) and record it in the top-level `assumptions` array; a scalability component is allowed only when it is justified against a stated requirement or that stated assumption. Generic scalability or modernity components with no such justification remain disallowed.

### 1.3 Clean diff against v1.2 (short)

```diff
diff --git a/prompts/system/architecture-v1.2.md b/prompts/system/architecture-v1.3.md
--- a/prompts/system/architecture-v1.2.md
+++ b/prompts/system/architecture-v1.3.md
@@ -1 +1 @@
-# Architecture generation — system prompt v1.2
+# Architecture generation — system prompt v1.3
@@ -15,6 +15,8 @@
 components or infrastructure that the stated requirements do not need. Do not
 add components for needs the prompt did not state.
 
+For unstated quantities and vague prompts, follow the assumption-placement and justification rule in `## Assumptions and traceability`.
+
 ## Connection types
@@ -66,5 +68,7 @@
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

The nearest-prompt column was regenerated by reading `eval/eval_set.json`, `eval/eval_set_v2.json`, and `scratch/scratch_prompts.json` (prompt texts only; `runs/` was not opened). Each nearest entry quotes the existing prompt's id, title, and architecture shape as read from those files.

**At least four prompts keep shapes beyond request/record/conflict-check:** **ev3_05** (batch file ingestion + validation + aggregation + scheduled report generation), **ev3_06** (long-running workflow + external integration + state transitions), **ev3_08** (fan-out bulk notification + external integrations + idempotent delivery tracking), **ev3_12** (streaming ingestion + windowed aggregation + durable raw store + dashboard read model).

| Id | Category | Domain | Draft prompt concept (text only) | Architecture shape | Nearest existing prompt (from files) | Why it differs |
|---|---|---|---|---|---|---|
| ev3_01 | simple | Municipal pothole reporting | Design a system for residents of one city to report potholes. A resident submits a location, photo, and description; city staff can view reports and mark them repaired. Reports must remain durable after submission. Assume one city and modest volume. | Simple request/record workflow with staff status update | `ev2_04` — Campus parking permit renewal (simple submission, durable record, staff/system issuance, expiry date; one campus) | Same simple durable-record workflow family, but different domain and lifecycle: public civic issue report with staff repair status, not permit eligibility upload/issuance/expiry. |
| ev3_02 | simple | School club attendance register | Design an attendance register for after-school clubs at one school. A teacher records which students attended a session; staff can review past attendance by club and date. Attendance records must be durable. Assume one school and a small number of clubs. | Simple record capture and query | `ev_01` — Static marketing site with a contact form (simple durable submission storage + confirmation email) | Both are simple durable records, but ev3_02 is internal staff capture/query by club/date with no public site, no contact email workflow, and no visitor form. |
| ev3_03 | simple | Pet vaccination reminder service | Design a service for a veterinary clinic to remind owners about upcoming pet vaccinations. Staff record pets, vaccine dates, and due dates; the system sends a reminder before a due date. Reminder schedules and vaccination records must be durable. Assume one clinic. | Simple record + scheduled reminder trigger | `ev_03` — Background email sender (application hands off transactional email and continues immediately) | Both involve sending email, but ev3_03 adds durable domain records and due-date scheduling/reminder generation; ev_03 is only a generic handoff/send path. |
| ev3_04 | simple | Cooking club recipe sharing | Design a recipe sharing site for a local cooking club. Members can post recipes with ingredients and steps, and browse recipes posted by others. Recipes must remain durable after posting. Assume one club and modest usage. | Simple user-generated content publish and browse | `ev_01` — Static marketing site with a contact form (simple web site, durable form submissions, confirmation email) | Both are small web systems, but ev3_04 is member-authored content publish/browse with durable recipe records, not static marketing pages plus a contact form. |
| ev3_05 | medium | Monthly energy-usage batch reporting | Design a system that produces monthly energy-usage reports for property managers. Daily meter readings arrive as files from an external utility provider; the system validates them, stores them durably, aggregates monthly totals per property, and generates a report after month end. Late corrections for a prior day may arrive and must be reflected in the next report run. Assume thousands of meters. | Batch file ingestion + validation + aggregation + scheduled report generation | `ev_07` — Search with index synchronisation (catalog edits synchronized into searchable index; search/read path separate from save path) | Both move data into a derived view, but ev3_05 is file-based batch ingestion with validation, monthly aggregation, late-correction reruns, and report generation, not near-real-time search indexing. |
| ev3_06 | medium | Vendor contract document-signing workflow | Design a document-signing workflow for vendor contracts. A procurement user creates a contract, sends it to an external e-signature provider for signature, tracks pending/signed/declined state, and stores the signed artifact durably. The contract must not be marked signed until the provider confirms completion. Assume modest contract volume. | Long-running workflow + external integration + state transitions | `ev_06` — Event-driven order pipeline with retries (continuous orders; independent steps like fraud screening, inventory reservation, notification; retries) | Both are asynchronous multi-step workflows, but ev3_06 is a long-running external e-signature workflow with provider confirmation and durable signed artifact, not an internal event-driven order pipeline. |
| ev3_07 | medium | Municipal procurement bid deadline | Design a bid-submission system for a municipal procurement office. Suppliers submit sealed bids for a published tender before a fixed deadline. The system must reject late bids, keep bids confidential until the tender closes, and record all submitted bids durably. Assume one tender at a time and moderate volume. | Deadline-gated sealed submission with confidentiality state transition | `ev2_09` — Concert ticket sales with seat holds (contended seat selection, short hold window, expiry/release, payment before hold expires) | Both have time-bound behavior, but ev3_07 is deadline-gated sealed bid submission with confidentiality until close and no holds, no seat inventory, and no payment flow. |
| ev3_08 | medium | School closure bulk notification system | Design a system that sends school-closure alerts to parents. Administrators publish a closure notice; the system fans out notifications by email and SMS through external providers, records delivery attempts, and avoids sending the same notice twice to the same recipient. Assume thousands of recipients per notice. | Fan-out bulk notification + external integrations + idempotent delivery tracking | `ev_03` — Background email sender (application hands off transactional email and continues immediately) | Both send notifications, but ev3_08 is multi-channel fan-out to thousands of recipients with per-recipient dedup/delivery tracking and external SMS/email providers, not a single transactional handoff. |
| ev3_09 | complex | Blood-donation appointment and deferral windows | Design appointment scheduling for a blood-donation center. Donors book appointments, but a donor who has a recorded deferral window must not be booked inside that window. Appointments and deferral records must be durable. Staff can cancel appointments and update deferral windows. Assume several centers and high day-to-day volume. | Rule-constrained scheduling with durable eligibility windows | `ev2_05` — University course registration with prerequisites and waitlists (limited seats, prerequisite rule, waitlist auto-enrolment, bursty term start) | Both enforce eligibility rules before accepting a booking/enrolment, but ev3_09 uses time-based deferral windows, appointment cancellation/updates, and no waitlist auto-enrolment or course-section model. |
| ev3_10 | complex | Harbour berth allocation with tide windows | Design berth allocation for a small harbour. A vessel requests a berth for an arrival window; the system assigns a compatible berth only when tide and berth availability allow it. Allocations must be durable, and the same berth must not be assigned to overlapping vessel windows. Assume one harbour and many daily requests. | Constraint-based resource allocation over time windows | `ev2_09` — Concert ticket sales with seat holds (many buyers contend for seats; short hold; hold expiry releases seat) | Both allocate contended resources over time, but ev3_10 assigns compatible berths by tide/availability windows with no payment/hold-expiry checkout flow and different physical constraints. |
| ev3_11 | complex | Disaster shelter occupancy and supply tracking | Design a system for emergency shelters to track occupancy and critical supplies. Staff record intake, departure, and bed assignments; supply counts are updated as items are consumed or restocked. A shelter must not exceed its bed capacity, and occupancy/supply records must be durable during an active incident. Assume multiple shelters and intermittent connectivity to a central office. | Operational state tracking with capacity invariants and intermittent-sync tolerance | `sc_04` — Offline field inspection (technicians complete inspections offline for days; edits must be visible immediately to other technicians and back office) | Both mention disconnected/field operation, but ev3_11 focuses on durable occupancy/supply state with bed-capacity invariants and intermittent central-office sync; it does not require impossible immediate global visibility while fully offline. |
| ev3_12 | complex | Clickstream analytics pipeline | Design a clickstream analytics pipeline for a web product. Browser clients send page-view and interaction events continuously. The system must ingest events at high volume, aggregate counts per page and per minute for dashboards, and keep raw events durably for later ad-hoc analysis. Assume late or duplicated events may occur. | Streaming ingestion + windowed aggregation + durable raw store + dashboard read model | `sc_02` — Sensor telemetry intake (thousands of devices; out-of-order/duplicated readings; live last-known value per device; durable history) | Both ingest high-volume late/duplicate events and keep durable history, but ev3_12 aggregates page/minute counts for dashboards over web clickstream events and has no per-device last-known live operator view. |
| ev3_13 | adversarial / contradiction | Exactly-once delivery with no sender copy and offline receiver | Design a message-delivery system with this requirement: "A message must be delivered exactly once. The sender may never store a copy, and the receiver may be offline for days." Deliver a design. | Adversarial contradiction (logically airtight) | `ev_13` — Contradiction: single region and region-loss survival (must run entirely in one region and also survive loss of any single region without downtime) | Both are adversarial contradictions requiring a delivered design, but ev3_13 is a message-delivery guarantee contradiction (exactly-once with no sender copy and long receiver offline), not a residency/failover contradiction. **Suggested by the reviewer.** |
| ev3_14 | adversarial / vague | Volunteer coordination thing | Design our new volunteer coordination thing. It should be helpful, modern, and work for the organization as it grows. We have not decided what activities volunteers do, who approves them, or how big the organization is. Make reasonable assumptions and give us something we can discuss. | Vague/minimal discussable design | `ev_14` — Vague: scale, cheap, and AI (product undefined; scale/cheap/AI requested; make reasonable assumptions) | Both are vague adversarial prompts, but ev3_14 is vague about volunteer activities/approval/organization size and does not invoke AI/cheap/product-undefined technology framing. |
| ev3_15 | adversarial / impossible | Real-time evacuation route with no connectivity and mandatory central live coordination | Design a real-time evacuation routing system for a disaster zone. Evacuees' devices have no network connectivity, but every route update must be centrally coordinated and delivered to all evacuees in real time. Deliver a design. | Adversarial impossible/contradictory requirements | `ev_15` — Impossible: global strong consistency under 10 ms at zero cost (globally strong consistency, <10ms on every continent, zero infrastructure cost) | Both are impossible adversarial prompts requiring a delivered design, but ev3_15 is a connectivity/coordination impossibility in disaster routing, not a latency/consistency/cost impossibility. |

### 2.4 ev3_14 component_count limit (written now, before any v3 output exists)

For **ev3_14 only**, the draft deterministic rubric will include:

- `r01` `component_count(lte=6)` — **must_include / deterministic**.
- **Justification from prompt text:** The prompt states only "volunteer coordination thing" and gives no concrete activities, approval owner, data flows, integrations, or scale target. The only defensible minimum for a discussable design is one volunteer-facing client boundary, one coordination service, and one durable store (3 components). Up to three additional components may be justified only by explicitly stated assumptions in the top-level `assumptions` array (for example, an assumed notification channel, an assumed auth provider, or an assumed staff/admin boundary). Anything beyond 6 would be generic "modern/grows" infrastructure not required by the prompt text or a stated assumption. This limit is prompt-text-justified and must be recorded in the rubric `notes`.
- **Pre-registration:** This limit and justification are fixed before any v3 output exists and are **not tuned after v3 results**.

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
| 1 | Accept v1.3 wording? | **Yes**, with the rewrite in item 1: clean capitalized sentences, placed once in Assumptions and traceability, one-line cross-reference in its own paragraph, conflict with "do not omit a necessary component" resolved. |
| 2 | Where to place assumption-array rule? | **Once only**, in `## Assumptions and traceability`; Minimal, justified structure gets a cross-reference. |
| 3 | v3 concept set? | **Approved** with review changes: ev3_01 replaced; ev3_06/ev3_08/ev3_12 replaced with different architecture shapes; ev3_04/ev3_07/ev3_12 replaced again for file-based nearest-prompt distance; ev3_13 replaced with reviewer-suggested airtight contradiction. |
| 4 | Assumption predicate token policy? | **Yes** — narrow prompt-justified token, or no assumption predicate. |
| 5 | v3 independence disclosure? | **Yes** — independence limited; product owner is the only independent reviewer and must read all 15 prompts and every rubric item in full before freeze. |
| 6 | Runner/report version plumbing? | **Yes** — additive version support only; no default change. |
| 7 | Next execution gate? | **Yes** — after review approval, implement v1.3 prompt file + tests/docs, author v3 eval set + tests/docs, run 5-call v1.3 scratch check on a different day, then request approval for single-shot v3 scored run. |

## 6.1 Reviewer-feedback rubric edits (26 November 2026, unfrozen draft)

The following rubric edits were applied after reviewer feedback while v3.0 remains unfrozen: ev3_05 r01/r02 switched to `component_exists(type=service)` and `path_exists(from_type=service, to_type=database)`; ev3_13 x01 replaced `component_exists(type=object_storage)` with `component_exists(type=cdn)` and r02 switched `component_exists(type=client)` to `component_exists(type=service)`; ev3_12 x02 replaced `component_exists(type=external_service)` with `component_exists(type=auth_provider)`, justified in notes because no authentication requirement is stated; ev3_14 x01 replaced deterministic CDN exclusion with human must_not item "Any scalability component is justified by an assumption recorded in the assumptions array." (human items remain ≤3, atomic); ev3_15 r01 statement set to "A blocking contradiction flag is present."; ev3_07 x01 statement set to "No external service is present although no requirement justifies one." These edits followed reviewer feedback.

## 7. Non-actions

- No v2 edit.
- No threshold change.
- No `scored_run_approved` or `selected_model` change.
- No provider calls.
- No code/prompt file/eval file implementation in this step.
- No `runs/` opened.

*End of draft v3. Stop for review.*
