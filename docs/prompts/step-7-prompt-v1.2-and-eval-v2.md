# Step 7 — Proposed system prompt v1.2 and held-out eval set v2.0

**Status: DRAFT v2 — APPROVED WITH CHANGES, pending final review before freeze.**
**Date: 21 November 2026**
**Supersedes:** draft v1 of this document. Decisions 1–10 were approved with the six recorded changes; they are incorporated below.
**Source of truth:** frozen v1.0 results (`runs/nemotron-3.5-super-vl/`, `eval/eval_set.json`, `eval/freeze.json` with `system_prompt_version: "1.1"`), the accepted zero-call diagnosis, the product-owner approval of 21 November 2026, `docs/prompts/step-2-eval-set.md` §5.4 (protocol), §5.5 (human scoring), §5.6 (change control), §9 (authoring rules).

> This document is a proposal only. It changes no code, no prompt text, no eval file, no threshold, no setting and no evaluator. `eval/eval_set.json` (v1.0) stays byte-identical and remains the frozen historical record. No model is called by this document. Do not write the v1.2 prompt file or any v2 eval file until this revised draft is approved.

---

## 1. Goal

Propose (a) a generic v1.2 system-prompt amendment that closes genuine instruction gaps exposed by the frozen v1.0 scored run, (b) a brand-new held-out eval set v2.0 with the same category counts and the same pass bar, written from general system-design practice, (c) a versioning scheme so two eval versions coexist without breaking the v1.0 hash check or its history, (d) the v1.0 rubric defects as lessons, (e) a single-shot evaluation protocol, (f) a five-call scratch regression check, and (g) the run plan and call budget.

The mechanical v1.0 FAIL stands: 11/15 prompts passed the gate, and the adversarial set cannot reach 3/3 (ev_13 and ev_15 both failed). This proposal does not re-score v1.0, does not tune anything to a model's output, and never reports v1.2 results on the v1.0 set.

---

## 2. In scope

- Exact revised v1.2 wording (generic only, no eval-specific content).
- 15 fresh v2.0 prompt concepts with rubric-design constraints and authoring-independence controls.
- Dual-eval-version handling for runner, `freeze.json` and README.
- The three v1.0 rubric defects as design lessons.
- Pre-registered single-shot protocol.
- Changelog requirements for v1.2 and v2.0.
- Five-call scratch regression check, run plan, call budget, and model order.
- Review-before-freeze gate and the decisions record.

## 3. Out of scope

- Editing `eval/eval_set.json`, `prompts/system/architecture-v1.md`, thresholds, settings, schema, runner, evaluator or any code.
- Writing the v1.2 prompt text, `eval/eval_set_v2.json`, versioned freeze entries or any hash before this revised draft is approved and the review in §12 is complete.
- Re-running v1.0 or generating any human scores.
- Any provider call.
- Naming a selected model or flipping `scored_run_approved` (the product owner does both).

---

## 4. V1.0 post-mortem classification (approved)

Under the rule "a failure caused by an instruction absent from the system prompt is (c), not (a)", the 21 failed-item instances across the 15 gate-failing runs reclassify as follows. Strict reading approved: **(a) 5 / (b) 3 / (c) 13**.

| Class | Count | Items |
|---|---:|---|
| **(a) model design error** | **5** | ev_09 r10 (component placed in two groups — v1.1 §Groups explicitly forbids this); ev_13 run-1 r01/r02/r03 (no design delivered — v1.1 §Flags explicitly says "a flag never replaces the design"); ev_15 run-1 r04 (no blocking flag — v1.1 §Flags defines blocking for impossible requirements). These instructions already exist in v1.1; the model violated them. |
| **(b) rubric defect** | **3** | ev_06 x03 (over-broad `connection_exists(service→message_queue, sync)` flags an admin DLQ read); ev_10 x02 (`component_exists(search_index)` flags a spatial/geo index the prompt requires); ev_12 run-3 r04 (`connection_exists(service→database, sync)` hard-codes one topology). |
| **(c) system prompt gap** | **13** | ev_03 run-2 r04 and run-3 r04 (client vs service undefined — 2); ev_08 x02/x03 in runs 1–3 (6); ev_12 run-3 x03 (1); ev_13 run-3 x01 (1); ev_14 r01 in runs 1–3 (3). All are "unrequested component" or "undefined client vs service" failures: v1.1 gives no rule requiring a component to be justified by a stated requirement, and no definition of `client` vs `service`. |

The broader reading (a) 1 / (b) 3 / (c) 17 was considered and not adopted: v1.1 already contains the instructions violated by the five class-(a) items.

---

## 5. PROPOSED system prompt v1.2 — final exact wording

Four generic amendments. Everything else in v1.1 stays byte-identical. No eval prompt, item id, threshold or model is referenced.

### 5.1 New section "Minimal, justified structure" (insert before `## Connection types`)

Final exact wording, revised to justify components by stated functional **or non-functional** requirements and to preserve assumptions about unstated quantities and definitions:

```
## Minimal, justified structure

Include only the components, connections and groups that the stated requirements
justify. A requirement may be functional or non-functional, including stated
needs for scale, availability, latency, durability and security; any of these
can make a component necessary. For every component, connection and group you
include, either cite the requirement that makes it necessary or state it as an
assumption and explain why that requirement needs it. Do not omit a component
that a stated requirement makes necessary.

An assumption about an unstated quantity or definition — such as the number of
users, the budget, or the meaning of a vague term — remains allowed and must be
stated as an assumption. The restriction in this section applies only to adding
components or infrastructure that the stated requirements do not need. Do not
add components for needs the prompt did not state.
```

The earlier phrase listing "common practice", "good architecture" or "it might be useful later" as non-reasons is removed: wording of that kind could suppress implied needs. The rule now limits only unjustified *additions*, never components made necessary by scale, availability, latency, durability or security.

### 5.2 Expand `## Component types` with two definitions

```
## Component types

client, api_gateway, load_balancer, service, worker, database, cache,
message_queue, object_storage, cdn, auth_provider, search_index, scheduler,
external_service

`client` is an endpoint that a human or an external system uses to initiate work
or receive a result. It issues requests; it does not own durable state and does
not implement the product's business rules. Use `client` for browsers, mobile
apps, partner systems and operator consoles.

`service` is an owned backend component that accepts requests and carries out the
product's business rules, including reading and writing the product's durable
state. If the application named in the prompt performs reads or writes, accepts
requests, or enforces rules, model it as a `service`, not as a `client`. Use
`client` only for the boundary that talks to that service or to another system.
```

### 5.3 Strengthen the flag paragraph in `## Flags` (replace the existing paragraph at lines 32–33)

```
A clean prompt must not produce a blocking flag. Whenever two or more stated
requirements cannot all hold, or one stated requirement is impossible, you must
raise a contradiction flag with severity: blocking and name the conflicting
requirements in the flag. Do not leave the flag set empty in that situation.

A flag never replaces the design: always deliver the full architecture, including
the service, the durable store and their connections, even when a blocking flag is
present. The flag explains what cannot be satisfied; it is not a reason to omit
parts of the design.
```

### 5.4 Rationale for the four changes

1. **5.1** closes the "unrequested components" gap (11 of the 13 class-(c) items), while explicitly allowing components justified by non-functional needs and explicitly permitting stated assumptions about unstated quantities and definitions.
2. **5.2** closes the "client vs service" gap (2 class-(c) items; ev_03).
3. **5.3 first paragraph** reinforces an existing rule that was violated (ev_15).
4. **5.3 second paragraph** reinforces an existing rule that was violated (ev_13 run-1).

All four statements are about the generation contract in the abstract. None mentions an eval id, a rubric item, a predicate, a model, or a v1 result.

---

## 6. NEW held-out eval set v2.0 (proposed, 15 prompts)

### 6.0 Authoring independence (required disclosure and controls)

**Disclosure:** the author of this draft has seen the v1.0 diagnosis, including its failing item ids, graph evidence and classification. That knowledge is used only for the *general* rubric-design lessons in §6.3 and §8. It is not used to generate v2 prompt concepts or rubric items.

Steps taken, and required while authoring v2:

1. **No output inspection.** While authoring v2, do not open `runs/`, any run record, the diagnosis output, or any model output. No v2 item is written by reading what a model did in v1.
2. **Practice-only sources.** v2 prompts and rubrics are derived from the prompt texts themselves and general system-design practice — minimal sufficient structure, ownership of durable state, sync/async boundaries, correctness under retries, and explicit handling of conflicting or vague requirements.
3. **Domain-source restriction.** The only source files consulted for domain exclusion are `eval/eval_set.json` (v1.0 prompt titles/text) and `scratch/scratch_prompts.json`; all 15 v2 domains are new to both.
4. **No predicate copied from a failure instance.** Predicates are selected from the existing grammar to express the prompt's stated outcome; no predicate is chosen because it would have caught a specific v1 run. The three v1 defect lessons are recorded as abstract rules (§6.3, §8), not as item templates, and no v1 item id or graph detail is reproduced in v2.
5. **Numeric limits restricted.** `component_count` is used only on the vague adversarial prompt ev2_14, with a justification written from that prompt's text. No other v2 prompt carries a numeric component limit; no limit is copied from, adjusted to, or derived from v1 results.
6. **Single-pass authoring.** All 15 prompts and rubrics are written in one pass, then reviewed against their own prompt texts only — never against v1 results, model outputs or the diagnosis. Any revision must be justified from the v2 prompt text.
7. **Draft gate.** No v2 file is written until this revised draft is approved; the written files are then reviewed under §12 before anything is frozen or run.

### 6.1 Fixed properties

- File: `eval/eval_set_v2.json` (new file; v1.0 file untouched). `eval_set_version: "2.0"`.
- IDs `ev2_01` … `ev2_15`; category counts **4 simple / 4 medium / 4 complex / 3 adversarial** (one contradiction, one vague, one impossible).
- **Same pass bar as v1.0**: prompt passes on ≥2/3 runs passing the deterministic gate plus its human items; set passes on ≥13/15 prompts, 4/4 complex, 3/3 adversarial, and ≥41/45 first-attempt schema-valid runs. Thresholds are not changed.
- Same temperature, `max_tokens`, timeout, attempts, response mode and system-prompt-with-v1.2 once approved. No per-model settings.
- Prompts describe outcomes and constraints, never solutions. No component-type name, technology name, or predicate hint appears in any prompt text (v1 step-2 §9 leak guard).
- Rubrics are authored from general system-design practice — minimal sufficient structure, correct ownership of durable state, correct sync/async boundaries, explicit handling of conflicting or vague requirements. **No rubric item is derived from any model's output.** v1 failed graphs are not a source for v2 items.
- Human items capped at 3 per prompt; every prompt includes the fixed item "Every technology label names a real product that fits its component type."

### 6.2 Domain separation

v1.0 domains (excluded): marketing site, URL shortener, email sender, admin sign-in, e-commerce checkout, order pipeline, search indexing, multi-tenant SaaS, video platform, ride-hailing, payment ledger, real-time chat, and the three adversarial themes (single-region vs region-loss; vague scale/cheap/AI; global strong consistency vs 10 ms vs zero cost).

Scratch domains (excluded): large-file sharing, sensor telemetry, meeting-room booking, field-inspection offline app, vague internal ops tool.

All 15 v2.0 domains below are new to both sets.

### 6.3 Rubric lessons built into v2.0

1. **No single-topology predicates.** A requirement that data be written durably is expressed with `path_exists(from_type=…, to_type=database)` or an outcome-based human item, never `connection_exists(from_type=service, to_type=database, type=sync)`.
2. **Bind `must_not` predicates to the statement's actual scope.** A `must_not` about an intake path must constrain the intake path, not every type-pair in the graph.
3. **Distinguish spatial from full-text indexes.** No `component_exists(type=search_index)` `must_not` item where the prompt requires nearby/geo lookup; that judgment goes to a human item.
4. **No `must_not` items for merely plausible components.** A component is forbidden only when the prompt actually rules it out. Under proposed v1.2, an unrequested but justified component is handled by the system-prompt rule, not by a rubric trap.
5. **`component_count` only on the vague prompt.** ev2_14 is the sole v2 prompt with a numeric component limit, justified in `notes` from that prompt's own text. No other v2 prompt has a numeric limit; none is copied from, adjusted to, or derived from v1 results; none is set to 12 as a carry-over.

### 6.4 The 15 proposed prompts

**ev2_01 — simple — Public library loan desk**
Prompt: "Design the system for a single public library's loan desk. Librarians check books out to registered members, record returns, and see due dates. A member may have at most five books on loan. The library has one branch and modest traffic. Keep the design as small as the requirements allow."
Blocking flag: forbidden. Deterministic: a member-facing boundary, an owned backend component that enforces the five-book rule, a durable store for loans; `path_exists` from member boundary to the durable store; `no_reference_issues()`. No numeric component limit.
Human: technology realism; the five-book limit is enforced by the owned backend, not by the client.

**ev2_02 — simple — Dental clinic appointment booking**
Prompt: "Design appointment booking for one dental clinic. Patients pick a slot with a dentist; two patients must never be given the same dentist and slot. Reception staff can see and adjust the schedule. Assume one location and a few dentists. Do not add infrastructure the requirements do not justify."
Blocking flag: forbidden. Deterministic: patient and staff boundaries, a backend that owns the schedule, a durable schedule store; `path_exists` from patient boundary to the schedule store; `no_reference_issues()`. No numeric component limit.
Human: technology realism; the no-double-booking rule is enforced server-side.

**ev2_03 — simple — Paywalled article access for a small newspaper**
Prompt: "Design access to articles for a small newspaper. Subscribers can read articles; non-subscribers can see titles only. Subscription status is checked on each read. The publisher has one site and a small readership. Keep the design minimal."
Blocking flag: forbidden. Deterministic: reader boundary, owned backend enforcing entitlement, durable subscription store, durable article store; `path_exists` from reader boundary to the article store; `no_reference_issues()`.
Human: technology realism; entitlement is enforced by the owned backend rather than inferred from the client.

**ev2_04 — simple — Campus parking permit renewal**
Prompt: "Design permit renewal for a university campus. A staff member uploads proof of eligibility, the system records it, and a permit is issued. Each permit has an expiry date. Assume one campus. Do not introduce components for needs the prompt does not state."
Blocking flag: forbidden. Deterministic: staff boundary, owned backend, durable record store, a durable place for the uploaded proof; `path_exists` from staff boundary to the record store; `no_reference_issues()`. No numeric component limit.
Human: technology realism; expiry is stored and checked by the owned backend.

**ev2_05 — medium — University course registration with prerequisites and waitlists**
Prompt: "Design course registration for a university. Students enrol in sections with limited seats. A student who lacks a prerequisite cannot enrol. When a section is full, the student joins a waitlist and is enrolled automatically when a seat opens. Registration is bursty at term start. Assume tens of thousands of students."
Blocking flag: forbidden. Deterministic: student boundary, owned backend enforcing prerequisites and seat limits, durable enrolment store, durable waitlist state; `path_exists` from student boundary to the enrolment store; `no_reference_issues()`; async hand-off described via an outcome-based human item rather than a fixed edge.
Human: technology realism; prerequisite and seat checks happen in the owned backend; waitlist promotion is automatic and does not overfill the section.

**ev2_06 — medium — Prescription refill with pharmacist review**
Prompt: "Design prescription refill requests for a pharmacy chain. A patient requests a refill. A pharmacist must approve it before a label is printed. Requests that need clarification are held and shown to the pharmacist. Refill history must be available to the pharmacist. Assume many pharmacies and modest per-pharmacy volume."
Blocking flag: forbidden. Deterministic: patient and pharmacist boundaries, owned backend for the workflow, durable request/history store; `path_exists` from pharmacist boundary to the history store; `no_reference_issues()`. No `must_not` on any plausible component (e.g. a notification path is allowed).
Human: technology realism; no label is printed before pharmacist approval; held requests are visible to the pharmacist.

**ev2_07 — medium — Freight shipment tracking across carriers**
Prompt: "Design shipment tracking for a freight broker. Shipments pass through several legs run by different carriers. Carriers post milestone events; customers query current status. Events may arrive late or out of order, and a later milestone must not be overwritten by an earlier one. Assume hundreds of shipments per day."
Blocking flag: forbidden. Deterministic: carrier and customer boundaries, owned backend that accepts milestones, durable event store; `path_exists` from customer boundary to the event store; `no_reference_issues()`; ordering correctness assigned to a human item (a deterministic type-pair cannot express "out-of-order events handled").
Human: technology realism; out-of-order milestones are ordered by the owned backend; customers never write milestone events directly.

**ev2_08 — medium — Multi-site retail stock transfer**
Prompt: "Design stock transfers between stores of a retail chain. A store requests a transfer; the receiving store reserves the item before dispatch, and the sending store decrements stock when the transfer is confirmed. Two transfers must not claim the same unit. Inventory counts must be durable. Assume dozens of stores."
Blocking flag: forbidden. Deterministic: store boundary, owned backend, durable inventory store, durable reservation state; `path_exists` from store boundary to the inventory store; `no_reference_issues()`.
Human: technology realism; reservation prevents double-claim; decrements happen only on confirmation.

**ev2_09 — complex — Concert ticket sales with seat holds**
Prompt: "Design ticket sales for a single concert. Many buyers try to select seats at once. A selected seat is held for a short window; if the buyer does not pay in time the hold expires and the seat becomes available again. A seat must never be sold twice. Sales last for one launch window with very high initial traffic."
Blocking flag: forbidden. Deterministic: buyer boundary, owned backend, durable seat/hold store; `path_exists` from buyer boundary to the seat store; `no_reference_issues()`; `path_exists` for the expiry path to the seat store. No `connection_exists(service→database, sync)` item.
Human: technology realism; expiry and single-sale guarantee are enforced by the owned backend; holds do not leak between buyers.

**ev2_10 — complex — National identity record lookup with audit trail**
Prompt: "Design a lookup service for national identity records. Authorised officials query a record by identifier. Every query and every result is written to an append-only audit log. Officials must not be able to edit or delete audit entries. Assume a large country and strict residency rules for the data."
Blocking flag: forbidden. Deterministic: official boundary, owned backend enforcing authorisation, durable record store, durable append-only audit store; `path_exists` from official boundary to the audit store; `no_reference_issues()`; `no_flag(severity=blocking)` (the prompt is satisfiable).
Human: technology realism; audit entries are append-only and cannot be altered by officials; authorisation is enforced in the owned backend.

**ev2_11 — complex — Cross-border remittance with reconciliation**
Prompt: "Design a remittance service that sends money between countries. A sender funds a transfer; a recipient receives it in local currency. Each transfer must be recorded exactly once in a durable ledger, and settlement must be reconciled daily. Regulatory checks must pass before funds move. Assume moderate volume and multiple currencies."
Blocking flag: forbidden. Deterministic: sender and recipient boundaries, owned backend, durable ledger, durable reconciliation state; `path_exists` from sender boundary to the ledger; `no_reference_issues()`; human item for "exactly once" because a queue alone cannot prove it.
Human: technology realism; the ledger is the authority for exactly-once effects; regulatory checks run before funds move; reconciliation is daily.

**ev2_12 — complex — Live sports score aggregation with corrections**
Prompt: "Design live score delivery for a sports league. Several independent feeds report events; some events arrive late or are corrected. Fans see near-live scores. A correction must be reflected everywhere, and a replay of a match must show the state as it was known at the time. Assume many concurrent fans and a few dozen matches."
Blocking flag: forbidden. Deterministic: fan and feed boundaries, owned backend, durable event store, durable snapshot/history store; `path_exists` from fan boundary to the event store; `no_reference_issues()`; correction and replay correctness assigned to human items.
Human: technology realism; corrections propagate to all readers; replay uses recorded historical state rather than current state.

**ev2_13 — adversarial (contradiction) — Retention vs erasure**
Prompt: "Design an archive for a regulated business. Every record must be retained permanently for audit. The same records must be erased completely within thirty days when a person withdraws consent. Deliver a design."
Blocking flag: required. Deterministic: a `contradiction` flag with `severity: blocking`; a complete design present — a backend component, a durable store, and a path between them — even though the flag is set; `no_reference_issues()`.
Human: technology realism; the design does not silently drop either requirement; the blocking flag names both conflicting requirements.

**ev2_14 — adversarial (vague) — Loyalty "thing"**
Prompt: "Design our new customer loyalty thing. It should be engaging, modern, and work at scale. We have not decided what the benefit is or who runs it. Make reasonable assumptions and give us something we can discuss."
Blocking flag: optional. Deterministic: `component_count(lte=7)` with written justification in `notes`: the prompt leaves the benefit and operator undefined, so the defensible minimum is one customer boundary, one owned backend, one durable store and at most four supporting edges; the limit is argued from the prompt's own emptiness, not from any previous result; `no_reference_issues()`; at least one visible assumption.
Human: technology realism; assumptions about scale, engagement and ownership are stated explicitly; invented product benefits are not presented as facts.

**ev2_15 — adversarial (impossible) — Offline live inventory**
Prompt: "Design an inventory view for field staff. Staff must see the current, live stock level while offline, with no local copy of stock data and no delay in updates. Deliver a design."
Blocking flag: required. Deterministic: a `contradiction` flag with `severity: blocking`; a complete design present — a backend component, a durable store, and a path between them — despite the flag; `no_reference_issues()`.
Human: technology realism; the design does not pretend that live accuracy with no local copy while offline is achievable; the blocking flag names the impossible combination.

---

## 7. Two eval versions without breaking v1.0

The v1.0 hash check and all v1.0 history remain authoritative and reproducible.

1. **Files.** Keep `eval/eval_set.json` byte-for-byte identical (v1.0, hash `280E2E41…C024DC`). Add `eval/eval_set_v2.json` with `eval_set_version: "2.0"`. Add `eval/CHANGELOG.md` entry for v2.0 only; v1.0 entry stays frozen.
2. **`eval/freeze.json`.** Keep the existing top-level `eval_set_sha256` and add a versioned block, e.g. `eval_sets: { "1.0": { "path": "eval/eval_set.json", "sha256": "<unchanged v1 hash>" }, "2.0": { "path": "eval/eval_set_v2.json", "sha256": "<recorded only after v2 is approved>" } }`, plus `eval_set_version: "1.0"` as the default selector. The v1.0 field and its value are not edited; `check_preconditions` continues to verify it for any v1.0 invocation. The v2 hash is written only after the v2 file is approved and is never back-filled into the v1 field.
3. **Runner.** Add a `--eval-set-version` flag defaulting to `1.0`. It selects which path/hash pair to validate. All existing commands without the flag behave exactly as today, so every v1.0 run record and the v1.0 report remain reproducible. Run records gain `eval_set_version` alongside the existing `eval_set_sha256`; v1.0 records are not rewritten.
4. **Report.** `app.eval.report` groups by `eval_set_version`. `runs/report.md` (v1.0) is not overwritten; v2.0 output goes to a versioned path such as `runs/v2/report.md`. The blind human sheet is generated per version.
5. **README.** Document both versions, both frozen hashes, that the pass bar and all thresholds are identical, that v1.0 results are immutable history and are never re-scored, that v1.0 is no longer held-out for v1.2, and that a version selector — not a file swap — chooses the set.
6. **Invariants.** `system_prompt_version` and `system_prompt_sha256` in the freeze change only when v1.2 is formally approved, in a separate reviewed step. `selected_model` stays absent until the product owner sets it; `scored_run_approved` is flipped only by the product owner.

---

## 8. The three v1.0 rubric defects — lessons, not edits

These stay in v1.0 exactly as written. They are recorded in `eval/CHANGELOG.md` as reasons for v2.0 design rules.

1. **ev_06 x03 — scope mismatch.** Statement concerns the intake path; predicate `connection_exists(from_type=service, to_type=message_queue, type=sync)` also flags an admin service reading a dead-letter queue, which the prompt explicitly requires. Lesson: a `must_not` predicate must be bound to the path or outcome named in its statement.
2. **ev_10 x02 — spatial vs full-text conflation.** Statement says "full-text index", but the flagged `search_index` was a driver-location index used for the prompt's explicit nearby-driver requirement. Lesson: never use a type-only `search_index` exclusion where the same component type can serve a spatial requirement; move that judgment to a human item.
3. **ev_12 run-3 r04 — single-topology assumption.** Statement says messages are written to durable history; predicate `connection_exists(from_type=service, to_type=database, type=sync)` requires one specific edge, though a worker writing to the database satisfies the outcome. Lesson: use `path_exists` or outcome-based human items.

---

## 9. Single-shot protocol (pre-registered)

1. **One shot per model.** v2 is run once per model with prompt v1.2: 15 prompts × 3 runs, no second evaluation and no post-result tuning.
2. **Resumption is not a new shot.** Daily cap exhaustion and a 429 stop-and-resume complete the same registered run with the same frozen files; they are not a retry of the evaluation. A crash that writes no record (e.g. `IncompleteRead`) is rerun with the same command under the same registration.
3. **Failure rule.** If a model fails v2, any further prompt change requires a **new held-out set v3**. v2 is never reused for tuning; no v2 item, threshold or prompt is edited after the first scored invocation.
4. **Reporting boundary.** Never report v1.2 results on the v1.0 set. All v1.2 claims come only from v2 runs. v1.0 results are reported only as v1.1 history.
5. **Scratch check is not an evaluation.** The five-call scratch check in §10 is a structural regression smoke test on scratch prompts only. It produces no score, is not part of the pass bar, and does not consume the single v2 shot.

---

## 10. Changelog requirements

1. **`prompts/system/CHANGELOG.md` v1.2 entry** must state that v1.2 was derived from scored v1.0 failures, cite the evidence, and state that v1.0 is no longer held-out for v1.2. Evidence to record: the 13 class-(c) instances (ev_03 r04 ×2; ev_08 x02/x03 ×6; ev_12 run-3 x03; ev_13 run-3 x01; ev_14 r01 ×3) that motivate §5.1 and §5.2, plus the five class-(a) instances (ev_15 run-1 r04; ev_13 run-1 r01/r02/r03; ev_09 r10) that motivate reinforcement in §5.3 and the existing group rule. The entry is written only after the prompt text is approved under §12.
2. **`eval/CHANGELOG.md` v2.0 entry** records the new set, its domain separation, the authoring-independence controls of §6.0, and the three v1.0 defects of §8 as history-only lessons. The v1.0 entry stays frozen and unedited.
3. **No back-dating.** Neither changelog is edited to imply v1.2 was designed before the v1.0 results existed.

---

## 11. Run plan and call budget

### 11.1 Scratch regression check (5 calls, different day)

- **Purpose:** confirm v1.2 causes no structural regression — schema validity, connection/flag/reference integrity, no crash — before any v2 scored call. It is not scored and is not evidence of v1.2 quality.
- **Scope:** nemotron-3.5-super-vl, response mode `json_schema`, **`max_tokens` fixed at 32768**, five prompts from `scratch/scratch_prompts.json` only. No v1.0 or v2 prompt is used.
- **Budget:** **5 provider calls** plus one redacted `GET /api/v1/key` check (0 calls). Redacted key check first; `LLM_API_KEY` only; cap = `remaining − 2`. If `remaining < 7`, defer the scratch check rather than run a partial one.
- **Scheduling:** run on a calendar day different from the v2 scored run, preferably before it. Never on the same day as the v2 scored invocation.
- **Reporting:** calls used, structural result for each of the five, and any infrastructure failure. A 429 is stop-and-resume, never a retry. If the current scratch path cannot fix `max_tokens` at 32768 without a code change, stop and ask before running it — no code change is authorised by this document.

### 11.2 nemotron-3.5-super-vl on v2.0

- 15 prompts × 3 runs = **45 runs**. Observed v1.0 attempts distribution: 42 runs × 1 attempt, 2 runs × 2, 1 run × 3 → **49 provider calls** for a full rerun (mean 1.089 calls/run). Budget **≈49 calls**, not 45.
- Each invocation: re-check `GET /api/v1/key` redacted first; cap = `remaining - 2`, using `LLM_API_KEY` only. Resume daily with the same command until all 45 runs are terminal. A 429 is stop-and-resume, never a retry. No code change for `IncompleteRead`; if it recurs, rerun the same command (no record is written for a crashed call) and report each occurrence.
- Report per invocation: runs completed n/45, first-attempt schema-valid so far, infrastructure failures. At 45/45: report mechanical first-attempt count n/45, per-prompt gate results, both blocking-flag directions, and state plainly whether the 41/45 bar was met.
- v2.0 scoring uses v1.2 system prompt (once approved) and the unchanged thresholds, under the single-shot protocol of §9.

### 11.3 Other models afterwards

| Order | Model | Condition | Notes |
|---:|---|---|---|
| 2 | `ling-3.2-flash` (`reasoning.enabled: false`) | Only after nemotron v2.0 completes | Its first v1.0 retest call returned 429 with no usage data, so reasoning-disabled was never verified. On its first call, inspect reasoning tokens; if not near zero, stop and report before any further call. Same 15×3 protocol and same cap rule. |
| 3 | `gemma-4-31b-it` | Only on a fresh day, and only if the shared pool is not returning 429 | Every v1.0 attempt was 429 from the upstream shared pool and nothing was charged. A 429 remains stop-and-resume, never a retry. Do not run it on the same day as another model's heavy invocation. Inclusion remains subject to your confirmation before any call. |

No other models. No cross-model averaging; report raw counts per model.

**Aggregate budget:** 5 scratch calls (nemotron, separate day) + ≈49 calls per scored model. Two scored models ≈103 calls plus the scratch check, spread across days under the daily cap.

---

## 12. Review before freeze (mandatory gate)

After you approve this revised draft:

1. I write the v1.2 prompt text (`prompts/system/architecture-v1.md` successor file) and `eval/eval_set_v2.json` with all 15 full rubrics, and compute the new SHA-256 hashes.
2. I **STOP** and print for your review:
   - the complete v1.2 prompt diff against v1.1;
   - all 15 v2 prompts in full;
   - every rubric item in full — id, statement, check kind, predicate/expected value, and human items.
3. Nothing is frozen and nothing is run before that review completes. Freeze entries, README, changelogs and any hash recording are a separate step after your approval of the written files.
4. I do **not** set `scored_run_approved` or `selected_model`; both remain yours.
5. No provider call is made at this stage, including the scratch check, until you separately authorise it.

---

## 13. Decisions record (1–10 approved with changes)

1. **Classification:** strict reading approved — (a) 5 / (b) 3 / (c) 13.
2. **v1.2 wording:** §5.1 revised as shown (functional and non-functional justification; assumptions about unstated quantities and definitions allowed and stated; "good architecture"-style wording removed; restriction limited to unjustified additions); §5.2 and §5.3 verbatim as shown.
3. **v2.0 prompt set:** all 15 concepts approved, authored under the independence controls of §6.0.
4. **component_count:** only on the vague prompt ev2_14, justified from the prompt text; no numeric limits elsewhere.
5. **Versioning:** `eval_sets` block and `--eval-set-version` approved; v1 fields never edited.
6. **Rubric lessons:** the three v1.0 defects are history only; no edits to `eval/eval_set.json`.
7. **Run order:** nemotron → ling (with reasoning-token check) → gemma; gemma inclusion to be confirmed before any gemma call.
8. **Budget policy:** `remaining - 2` cap and daily resume apply to v2.0 and to the scratch check.
9. **Gates:** `scored_run_approved` and `selected_model` remain yours; I will not set either.
10. **Next step:** amended by change 6 — write prompt, eval file and hashes, then STOP and print diff + all prompts + all rubric items for review before freeze; no provider call.

**Open for your review of this draft:** confirm gemma inclusion; confirm the scratch-check day and that `max_tokens` can be fixed at 32768 without a code change; confirm the order of freeze updates after §12.

---

## 14. Stop condition

This document has been updated to draft v2 and committed. No code, prompt text, eval file, threshold, setting, evaluator or freeze entry was changed by this step; no provider call was made; no model was run; no run record or model output was opened while revising this draft; `selected_model` remains absent and `scored_run_approved` remains as you set it. I stop for your review of the revised draft.
