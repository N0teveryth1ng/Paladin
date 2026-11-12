# Step 2 — Evaluation Set

**Draft step prompt · v1 · 12 November 2026 · awaiting review**
**Source of truth:** project document v1.2 §7, §8.7, §8.8, §10, §11; `docs/step-1-data-model.md` §11 (blocking flags) and §12 (step 3 retry telemetry).

> Review note: this is a draft for correction. Execute only the version I return.

---

## 1. Goal

Write the 15-prompt evaluation set with rubrics **before any generation code exists**, so that "it works" is a measurement rather than a feeling. The set must be able to fail a model, and must be able to distinguish a model that handles vague and contradictory prompts from one that silently guesses.

This step produces data and its schema. It does not run anything.

---

## 2. In scope

- 15 prompts, each with a rubric, in one machine-readable file.
- A Pydantic schema for the evaluation set, validated by tests.
- A scoring protocol document: how each rubric item is checked, how a prompt passes, how the set passes, and how results are reported per model.
- Explicit adversarial coverage: contradictory, vague, and impossible/over-constrained prompts.
- Blocking-flag expectations per prompt, scored in both directions (step 1 handoff §11).

## 3. Out of scope

- Any model client, API call, retry loop, or run record (step 3).
- Any scoring implementation or report generator (step 3).
- networkx validators (step 4), layout or rendering (step 5).
- Golden reference architectures per prompt — see decision 6.
- Changing step 1 models, enums, schema artifacts, or fixtures.
- Tuning prompts or rubrics to fit a model's behaviour.

---

## 4. Inputs from earlier steps

- `backend/app/model/` — the 14 `ComponentType` values, 2 `ConnectionType` values, `RequirementKind`, `FlagKind`, `Severity`. Rubric predicates must use this exact vocabulary; a rubric may not name a type that does not exist.
- `schema/architecture.generation.schema.json` — the contract a model must satisfy. Rubrics are written against the graph this schema describes.
- `backend/tests/fixtures/small_architecture.json` and `full_coverage_architecture.json` — worked examples of a valid graph, used to sanity-check that rubric predicates are expressible.
- `docs/step-1-data-model.md` §11 — blocking flags are metadata, delivered with the architecture, scored in both directions.
- `docs/step-1-data-model.md` §12 — step 3 must count retries caused by the blocking-flag rule.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  eval\
    eval_set.json                    # the 15 prompts with rubrics, single source of truth
    README.md                        # scoring protocol, pass bar, change control
  backend\app\eval\
    __init__.py
    models.py                        # Pydantic models for the evaluation set
  backend\tests\
    test_eval_set.py                 # validates the set against the models and the rules below
```

`backend/pyproject.toml` gains `app.eval` in `[tool.setuptools] packages`. Nothing else changes.

### 5.1 Evaluation set shape

```python
class EvalPrompt(BaseModel):
    id: str                      # ev_01 .. ev_15
    title: str
    category: Literal["simple", "medium", "complex", "adversarial"]
    adversarial_kind: Literal["contradiction", "vague", "impossible"] | None
    prompt: str                  # the exact text sent to the model, nothing else
    expected_requirements: list[str]      # the requirements a correct answer must have captured
    must_include: list[RubricItem]        # each item is required for the prompt to pass
    must_not_include: list[RubricItem]    # any violation fails the prompt
    blocking_flag_expected: Literal["required", "forbidden", "optional"]
    expected_assumptions: list[str]       # assumptions that must be stated visibly (vague prompts)
    notes: str | None            # why this prompt is in the set, what it is testing

class RubricItem(BaseModel):
    id: str                      # r01, r02 ... unique within the prompt
    statement: str               # what must be true, in one sentence
    check: Literal["deterministic", "human"]
    predicate: str | None        # required when check == "deterministic"
```

Deterministic predicates are expressed in a small fixed grammar over the step 1 graph, so step 3 can evaluate them without an LLM judge:

```
component_exists(type=<ComponentType>)                       # at least one
component_exists(type=<ComponentType>, technology~="<substring>")
connection_exists(from_type=<T>, to_type=<T>, type=sync|async)
connection_exists(from_type=<T>, to_type=<T>, label~="<substring>")
no_connection(from_type=<T>, to_type=<T>)
group_exists(member_type=<ComponentType>)                     # a group contains this type
no_reference_issues()                                         # check_references() returns empty
flag_present(kind=contradiction|underspecified|unverifiable, severity=blocking|warning)
no_flag(severity=blocking)
assumption_present(text~="<substring>")
component_count(lte=<int>)
```

Anything that cannot be expressed in this grammar is `check: "human"`. Human items are scored by the product owner, never by an LLM judge.

### 5.2 The 15 slots

Counts are fixed so the acceptance criteria are measurable.

| # | Category | Theme | Tests |
|---|---|---|---|
| 01 | simple | Static marketing site with a contact form | Minimal correct graph, no over-engineering |
| 02 | simple | URL shortener, single region | Cache on the read path, DB on the write path |
| 03 | simple | Background email sender | Queue + worker, async connection, no sync loop |
| 04 | simple | Auth for an internal tool | Auth provider boundary, token flow |
| 05 | medium | Microservices e-commerce checkout | Service boundaries, sync vs async choice, no chatty sync chain |
| 06 | medium | Event-driven order pipeline with retries | Async fan-out, dead-letter reasoning, idempotency assumption |
| 07 | medium | Search with index synchronisation | Eventual consistency stated, index not on the write path |
| 08 | medium | Multi-tenant SaaS with per-tenant isolation | Isolation assumption surfaced, shared vs dedicated DB |
| 09 | complex | Video upload, transcode, adaptive playback | CDN, object storage, queue, worker fan-out |
| 10 | complex | Ride-hailing dispatch | Geo-index, low-latency matching, scheduler, load balancer |
| 11 | complex | Payment ledger with exactly-once semantics | Idempotency, durable queue, strong consistency where needed |
| 12 | complex | Real-time chat at 50k concurrent connections | WebSocket path, presence cache, fan-out |
| 13 | adversarial | Contradiction: "single region" + "survive region loss" | Must flag, must still deliver a design |
| 14 | adversarial | Vague: "make it scale, keep it cheap, use AI" | Must state assumptions; no invented requirements presented as fact |
| 15 | adversarial | Impossible: global strong consistency, <10 ms writes, zero cost | Must flag as blocking; must not pretend it is solved |

Distribution: 4 simple, 4 medium, 4 complex, 3 adversarial (1 contradiction, 1 vague, 1 impossible).

### 5.3 Scoring protocol (`eval/README.md` must state all of this)

- A prompt **passes** when every `must_include` item is satisfied and no `must_not_include` item is violated.
- A `must_not_include` violation is a hard failure for that prompt, regardless of how much else is right. Inventing components, wrong flows and silent contradiction acceptance are the failure modes this product exists to prevent.
- `blocking_flag_expected: required` → the prompt fails if no blocking flag is present. `forbidden` → the prompt fails if one is present. `optional` → recorded, not scored.
- The **set** passes for a model only when all of the following hold, reported per model and never averaged across models:
  - at least 13 of 15 prompts pass;
  - all 4 complex prompts pass;
  - all 3 adversarial prompts pass;
  - schema-valid on first attempt for at least 90% of prompts.
- Report raw counts next to every percentage. A model that fails is reported as failed; the bar is not adjusted afterwards.

### 5.4 Change control (must be in `eval/README.md`)

- The set is frozen when this step is approved. Any later change is recorded in `eval/CHANGELOG.md` with the reason and the evidence that forced it.
- A prompt or rubric may be changed only because it was ambiguous, unfair, or mis-specified — never because a model scored badly on it.
- No prompt text may be edited after seeing model output.

---

## 6. Measurable acceptance criteria

1. `eval/eval_set.json` contains exactly 15 entries with IDs `ev_01` … `ev_15`, no gaps, no duplicates.
2. Category counts are exactly 4 / 4 / 4 / 3 (simple / medium / complex / adversarial).
3. Adversarial entries cover exactly one `contradiction`, one `vague`, one `impossible`.
4. Every entry has ≥ 3 `must_include` items and ≥ 2 `must_not_include` items.
5. Every `must_include`/`must_not_include` item with `check: "deterministic"` has a predicate that parses against the grammar in §5.1 and references only step 1 enum values.
6. Clean prompts (`simple`, `medium`, `complex`) have `blocking_flag_expected: "forbidden"`; adversarial contradiction and impossible prompts have `"required"`; the vague prompt is `"optional"` unless review decides otherwise.
7. Every entry has ≥ 1 `must_include` item with `check: "human"` — pure-predicate rubrics cannot catch technically-wrong-but-structurally-valid flows.
8. `eval/README.md` states the pass rules, the set-level bar, the human-scoring rule, and change control.
9. `backend/tests/test_eval_set.py` passes with the project venv, and `python -m pytest -q` is green.
10. The eval set validates against `app.eval.models` with zero errors, and the file is byte-stable across two consecutive test runs.

---

## 7. Tests (`backend/tests/test_eval_set.py`)

1. The file loads and validates against `EvalSet` (root model with `prompts: list[EvalPrompt]`).
2. Exactly 15 prompts, IDs sequential and unique.
3. Category distribution 4/4/4/3.
4. Adversarial kinds exactly one each.
5. Rubric minimums: ≥3 include, ≥2 exclude per prompt.
6. Every deterministic predicate parses; every `ComponentType`/`ConnectionType` token in a predicate is a real enum value; every prompt has ≥1 human item.
7. Blocking-flag expectations match the matrix in criterion 6.
8. `expected_assumptions` is non-empty for the vague prompt and for prompts whose `notes` claim an assumption dependency.
9. Prompt texts are unique, non-empty, and under 1,200 characters (they must fit a single generation call with the schema).
10. No prompt text contains the exact statement of one of its own `must_include` items (guards against leading the model to the answer).

---

## 8. Edge cases and risks

- **Rubrics that any model passes.** If a rubric only asks for "a database exists", it measures nothing. Every medium and complex prompt must contain at least one item about a *wrong* plausible design (the `must_not_include` side), because omission is the common failure, not absence.
- **Leading prompts.** Naming the technology in the prompt makes the test trivial and hides whether the model can choose. Only prompts 09–12 may name a domain-specific constraint that a real user would state (e.g. "50k concurrent connections"), never the solution.
- **Contradiction detection is judgment.** Some contradictions are genuinely resolvable by a stated assumption. Only prompt 13 and 15 are `required`; anything genuinely ambiguous must be `optional`, otherwise the set punishes a defensible answer.
- **Human items are a bottleneck.** Human scoring is the honest option in v1 (project doc §10 warns against a single biased LLM judge) but it must stay small: at most 3 human items per prompt, so a full run is reviewable in one sitting.
- **Rubric vocabulary drift.** A predicate naming `queue` instead of `message_queue` would silently never match. Test 6 is the guard.
- **Set-level bar gaming.** If the bar is defined after seeing results, it is worthless. It is fixed here, before generation code exists.
- **Prompt length.** Long prompts plus a 14 KB schema plus output tokens is a real context cost on free models. Test 9 caps prompt text at 1,200 characters.

---

## 9. Decisions needing your confirmation

1. **One JSON file** (`eval/eval_set.json`) rather than separate prompts/rubrics files. *Recommend: one file*, so a prompt and its rubric cannot drift apart.
2. **JSON, not YAML.** No new dependency, and the file is consumed by Python and reviewed in diffs. *Recommend: JSON.* YAML is nicer to hand-edit; say so if you prefer it and I will add PyYAML.
3. **The pass bar in §5.3** — 13/15 overall, all complex, all adversarial, 90% first-attempt schema validity. This is the number that decides whether GLM Flash survives step 3. *Recommend as written; change it now, not after seeing results.*
4. **No LLM judge in v1.** Deterministic predicates are scored by code; the rest by you. *Recommend: yes.* The alternative — one LLM judging another — is the bias risk the document names.
5. **No golden reference architectures.** Rubrics assert properties, not one blessed diagram, because system design has many valid answers. *Recommend: properties only.*
6. **The 15 slots in §5.2.** If you want different domains (e.g. replace chat with a data pipeline), say so now; after approval they are frozen.
7. **Vague prompt 14 expectation.** `blocking_flag_expected: "optional"` with `expected_assumptions` required. Flagging vagueness is defensible, but so is stating assumptions and proceeding — which is what the document prefers. *Recommend: optional, with assumptions mandatory.*

---

## 10. Stop condition

I write the eval set, its schema, its tests, and the scoring protocol; run the tests; report each acceptance criterion with real evidence; commit and push. I do not build the model client, do not call any model, do not score anything, and do not start step 3. Then I stop and wait for **approved**.
