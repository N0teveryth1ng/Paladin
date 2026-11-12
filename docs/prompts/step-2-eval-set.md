# Step 2 — Evaluation Set

**Step prompt · v2 · 12 November 2026 · approved with changes**
**Source of truth:** project document v1.2 §5, §7, §8.7, §8.8, §10, §11; `docs/step-1-data-model.md` §11 (blocking flags) and §12 (step 3 handoff).

> v2 supersedes the v1 draft. Where v2 and v1 conflict, v2 wins.

---

## 1. Goal

Write the 15-prompt evaluation set with rubrics **before any generation code exists**, so that "it works" is a measurement rather than a feeling. The set must be able to fail a model, and must be able to distinguish a model that handles vague and contradictory prompts from one that silently guesses.

This step produces data, its schema, and a predicate grammar validator. It does not call any model and does not evaluate any predicate against a graph.

---

## 2. In scope

- 15 prompts, each with a rubric, in one machine-readable file.
- Pydantic models for the evaluation set, validated by tests.
- A **parser and vocabulary validator** for the predicate grammar (`app/eval/predicates.py`). It parses and checks functions, arguments and enum values only. It does not evaluate predicates against a graph — that is step 3.
- A scoring protocol document covering the 3-run protocol, the deterministic gate, the prompt pass rule, the set-level bar, human scoring, and change control.
- Explicit adversarial coverage: contradictory, vague, and impossible/over-constrained prompts.
- Blocking-flag expectations per prompt, scored in both directions.

## 3. Out of scope

- Any model client, API call, retry loop, or run record (step 3).
- **Evaluation of predicates against an architecture graph** (step 3). The parser accepts a predicate; it never answers whether the predicate holds.
- Any scoring implementation, report generator, or judge (step 3 / human).
- networkx validators (step 4), layout or rendering (step 5).
- Golden reference architectures per prompt.
- Changing step 1 models, enums, schema artifacts, or fixtures.
- Tuning prompts or rubrics to fit a model's behaviour.

---

## 4. Inputs from earlier steps

- `backend/app/model/` — the 14 `ComponentType` values, 2 `ConnectionType` values, `RequirementKind`, `FlagKind`, `Severity`. Rubric predicates must use this exact vocabulary.
- `schema/architecture.generation.schema.json` — the contract a model must satisfy.
- `backend/tests/fixtures/*.json` — worked examples of a valid graph.
- `docs/step-1-data-model.md` §11 — blocking flags are metadata, delivered with the architecture, scored in both directions.
- `docs/step-1-data-model.md` §12 — step 3 retry telemetry for the blocking-flag rule.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  eval\
    eval_set.json                    # 15 prompts with rubrics, versioned, single source of truth
    README.md                        # scoring protocol, pass bar, human scoring, change control, frozen hash
    CHANGELOG.md                     # v1.0 entry, frozen on approval
  backend\app\eval\
    __init__.py
    models.py                        # EvalSet, EvalPrompt, RubricItem
    predicates.py                    # predicate grammar parser + vocabulary validator (no evaluation)
  backend\tests\
    test_eval_set.py
    test_predicates.py
```

`backend/pyproject.toml` gains `app.eval` in `[tool.setuptools] packages`. Nothing else changes.

### 5.1 Evaluation set shape

```python
class RubricItem(BaseModel):
    id: str                      # r01 ... unique within the prompt
    statement: str               # what must be true, in one sentence
    check: Literal["deterministic", "human"]
    predicate: str | None        # required when check == "deterministic"; must be None when "human"

class EvalPrompt(BaseModel):
    id: str                      # ev_01 .. ev_15
    title: str
    category: Literal["simple", "medium", "complex", "adversarial"]
    adversarial_kind: Literal["contradiction", "vague", "impossible"] | None
    prompt: str                  # the exact text sent to the model, nothing else
    expected_requirements: list[str]      # reference material for the human scorer; not machine-scored
    must_include: list[RubricItem]
    must_not_include: list[RubricItem]
    blocking_flag_expected: Literal["required", "forbidden", "optional"]
    expected_assumptions: list[str]
    notes: str | None

class EvalSet(BaseModel):
    eval_set_version: Literal["1.0"]
    prompts: list[EvalPrompt]
```

### 5.2 Predicate grammar

Deterministic predicates are expressed in a small fixed grammar over the step 1 graph, so step 3 can evaluate them without an LLM judge. `predicates.py` parses these forms and validates vocabulary only.

```
component_exists(type=<ComponentType>)
component_exists(type=<ComponentType>, technology~="<substring>")
connection_exists(from_type=<T>, to_type=<T>, type=sync|async)
connection_exists(from_type=<T>, to_type=<T>, label~="<substring>")
no_connection(from_type=<T>, to_type=<T>)
no_component(type=<ComponentType>)
group_exists(member_type=<ComponentType>)
no_reference_issues()
flag_present(kind=contradiction|underspecified|unverifiable, severity=blocking|warning)
no_flag(severity=blocking|warning)
assumption_present(text~="<substring>")
component_count(lte=<int>)
```

Rules enforced by the parser:

- exactly one call, no leading or trailing text;
- known function name; required arguments present; no unknown arguments; no duplicate arguments;
- `type`, `from_type`, `to_type`, `member_type` must be valid `ComponentType` values;
- `type` inside `connection_exists` must be a valid `ConnectionType` value;
- `kind` must be a valid `FlagKind`; `severity` must be a valid `Severity`;
- `lte` must be a non-negative integer;
- `~=` is only valid on `technology`, `label` and `text`; `=` is only valid on enum and integer arguments;
- string arguments are non-empty and at most 80 characters;
- `connection_exists` requires `from_type` and `to_type`, and at least one of `type` or `label~`.

Anything that cannot be expressed in this grammar is `check: "human"`. Human items are scored by the product owner only.

### 5.3 The 15 slots

| # | Category | Theme | Tests |
|---|---|---|---|
| 01 | simple | Static marketing site with a contact form | Minimal correct graph, no over-engineering |
| 02 | simple | URL shortener, single region | Read path vs write path separation |
| 03 | simple | Background email sender | Async hand-off, retry semantics |
| 04 | simple | Sign-in for an internal admin tool | Existing identity boundary respected |
| 05 | medium | Microservices e-commerce checkout | Service boundaries, sync vs async, no premature confirmation |
| 06 | medium | Event-driven order pipeline with retries | Duplicate handling, replay, head-of-line blocking |
| 07 | medium | Search with index synchronisation | Eventual consistency stated, save path not blocked |
| 08 | medium | Multi-tenant SaaS with per-tenant isolation | Isolation boundary surfaced, cost constraint honoured |
| 09 | complex | Video upload, transcode, adaptive playback | Edge delivery, durable media, async transcoding |
| 10 | complex | Ride-hailing dispatch | Spatial lookup, location ingestion, single-offer semantics |
| 11 | complex | Payment ledger with exactly-once effects | Idempotency, append-only ledger, no queue-only exactly-once claim |
| 12 | complex | Real-time chat at 50k concurrent connections | Long-lived connections, fan-out, offline catch-up |
| 13 | adversarial | Contradiction: "single region" + "survive region loss" | Must flag, must still deliver a design |
| 14 | adversarial | Vague: "make it scale, keep it cheap, use AI" | Assumptions stated; nothing invented as fact |
| 15 | adversarial | Impossible: global strong consistency, <10 ms writes, zero cost | Must flag as blocking; must not pretend it is solved |

Distribution: 4 simple, 4 medium, 4 complex, 3 adversarial (1 contradiction, 1 vague, 1 impossible).

### 5.4 Run protocol (must be written into `eval/README.md`)

- Each prompt is run **3 times per model**.
- Temperature, `max_tokens`, system prompt and schema are **identical across models and across runs**. Step 3 chooses those values and records them **before the first scored run**. They are never changed per model.
- A **run** passes the deterministic gate when:
  - every deterministic `must_include` item holds;
  - no deterministic `must_not_include` item is violated;
  - the `blocking_flag_expected` rule is met.
- A **prompt** passes when at least **2 of 3** runs pass the deterministic gate **and** the human items are satisfied on the first run that passed the gate.
- The **set** passes for a model only when **all** of these hold:
  - at least **13 of 15** prompts pass;
  - **all 4** complex prompts pass;
  - **all 3** adversarial prompts pass;
  - at least **41 of 45** runs are schema-valid on the first attempt.
- Report raw counts beside every percentage, per model, never averaged across models. The bar is never adjusted after seeing results.

### 5.5 Human scoring

- At most **3 human items per prompt**, scored by the product owner only.
- Every prompt includes one fixed standard human item: **"Every technology label names a real product that fits its component type."**
- `expected_requirements` is reference material for the human scorer and is not machine-scored.

### 5.6 Change control (must be in `eval/README.md`)

- The set is frozen when this step is approved.
- `eval/CHANGELOG.md` records every change with reason and evidence.
- A prompt or rubric may be changed only because it was ambiguous, unfair, or mis-specified — never because a model scored badly on it.
- No prompt text may be edited after seeing model output.
- On approval, the SHA-256 of `eval/eval_set.json` is recorded in `eval/README.md`. Step 3 must refuse to run if the file's hash differs, and every run record stores the hash.

---

## 6. Measurable acceptance criteria

1. `eval/eval_set.json` contains exactly 15 entries with IDs `ev_01` … `ev_15`, no gaps, no duplicates, and `eval_set_version: "1.0"`.
2. Category counts are exactly 4 / 4 / 4 / 3 (simple / medium / complex / adversarial).
3. Adversarial entries cover exactly one `contradiction`, one `vague`, one `impossible`.
4. Every entry has ≥ 3 `must_include` items and ≥ 2 `must_not_include` items.
5. Every deterministic item's predicate parses against §5.2 and references only step 1 enum values.
6. Clean prompts have `blocking_flag_expected: "forbidden"`; contradiction and impossible prompts have `"required"`; the vague prompt has `"optional"` with non-empty `expected_assumptions`.
7. Every entry has ≥ 1 `must_include` item with `check: "human"`, and includes the fixed standard technology-realism item; human items per prompt ≤ 3.
8. `eval/README.md` states the run protocol, gate, prompt rule, set bar, human scoring rule, change control, and the frozen-hash rule.
9. `backend/tests/test_eval_set.py` and `backend/tests/test_predicates.py` pass with the project venv; `python -m pytest -q` is green.
10. The eval set validates against `app.eval.models` with zero errors, and re-serialising it reproduces the file byte-for-byte.

---

## 7. Tests

### `backend/tests/test_eval_set.py`

1. File loads and validates against `EvalSet`.
2. Exactly 15 prompts, IDs sequential and unique, `eval_set_version == "1.0"`.
3. Category distribution 4/4/4/3.
4. Adversarial kinds exactly one each.
5. Rubric minimums: ≥3 include, ≥2 exclude per prompt.
6. Every deterministic predicate parses; enum tokens are real; every prompt has ≥1 human item; human items ≤3.
7. Blocking-flag expectations match the matrix in criterion 6.
8. The vague prompt has ≥2 `expected_assumptions`; any prompt whose notes mention assumptions has a non-empty list.
9. Prompt texts are unique, non-empty, and ≤1,200 characters.
10. **Leak guard:** no `technology~=` substring, and no human-readable component-type name, from a prompt's own deterministic predicates may appear in that prompt's text (case-insensitive, word-boundary matched). No exceptions.
11. Re-serialising the validated set reproduces the file byte-for-byte.

### `backend/tests/test_predicates.py`

1. Every grammar form in §5.2 parses and returns the expected function and arguments.
2. Unknown function rejected.
3. Unknown enum value rejected for `type`, `from_type`, `to_type`, `member_type`, `kind`, `severity`.
4. Unknown or duplicate argument rejected.
5. Missing required argument rejected; `connection_exists` with neither `type` nor `label~` rejected.
6. `~=` on an enum argument rejected; `=` on `technology`/`label`/`text` rejected.
7. Malformed input rejected: no parentheses, trailing text, unbalanced quotes, empty argument value, `lte` not an integer, `lte` negative, string argument over 80 characters.
8. Parser is side-effect free and returns frozen data (calling it twice yields equal results).

---

## 8. Edge cases and risks

- **Rubrics that any model passes.** Every medium and complex prompt must contain at least one `must_not_include` item describing a plausible wrong design, not only an omission.
- **Leading prompts.** Naming a component type or technology in the prompt makes the test trivial. The leak guard (test 10) enforces this mechanically, with no exceptions.
- **Contradiction detection is judgment.** Only prompts 13 and 15 are `required`. Anything genuinely ambiguous stays `optional`.
- **Human items are a bottleneck.** Capped at 3 per prompt so a full run is reviewable in one sitting.
- **Predicate vocabulary drift.** A predicate naming `queue` instead of `message_queue` would silently never match. Parser validation plus test 6 is the guard.
- **Set-level bar gaming.** The bar is fixed here, before generation code exists.
- **Parser scope creep.** The parser must not learn to evaluate. If a predicate needs evaluation semantics, that is step 3's problem; keep the parser purely syntactic.
- **Prompt length.** Capped at 1,200 characters, because prompt + 14 KB schema + output is real context cost on free models.

---

## 9. Authoring rules

- Rubrics are written from the failure definitions in project document §5: invented components, wrong flows, unsupported elements, missing dependencies, silently accepted contradictions. Not from any model's output.
- No model is called in this step.
- Every medium and complex prompt needs at least one `must_not_include` item describing a plausible wrong design, not only omissions.
- Prompt 11 must forbid claiming exactly-once delivery from the queue alone.
- Prompts describe outcomes and constraints, never solutions. No technology is named in a prompt.

---

## 10. Decisions (resolved)

1. One file, `eval/eval_set.json` — confirmed.
2. JSON — confirmed.
3. Pass bar — replaced by the protocol in §5.4.
4. No LLM judge — confirmed; deterministic predicates by code, the rest by the product owner.
5. Properties only, no golden architectures — confirmed.
6. The 15 slots — approved.
7. Prompt 14 `optional` with mandatory `expected_assumptions` — confirmed.

---

## 11. Report format

Per acceptance criterion: pass or fail with real evidence (full pytest output, two-run byte stability, files created or changed). Then print **all 15 prompts with their complete rubrics in full**, not summarized. State any deviation plainly.

---

## 12. Stop condition

I write the eval set, its schema, the predicate parser, its tests, the scoring protocol and the changelog; run the tests; report with real evidence; commit and push. I do not build the model client, do not call any model, do not evaluate predicates against a graph, and do not start step 3. Then I stop and wait for **approved**. After approval I record the SHA-256 in `eval/README.md`, commit it, and draft `docs/prompts/step-3-harness.md`.
