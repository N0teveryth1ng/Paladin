# Step 1 — Data Model

**Plan version:** 1.1 · **Status:** approved and implemented (12 November 2026) · **Date:** 12 November 2026
**Source of truth:** `AI-Native System Design Whiteboard Refined Scope and Core Direction.pdf` (v1.2), Sections 3, 4, 5, 8, 11.
**File location:** `docs/step-1-data-model.md` (this file is authoritative; the standing workflow template names `docs/prompts/step-1-<name>.md`).

---

## 1. Goal

Define the typed architecture graph as Pydantic v2 models, enforce every structural invariant the product depends on, and export two JSON Schemas: the contract the AI must emit, and the full stored record after the harness injects run envelope fields.

The model describes **structure and meaning only**. It is the foundation that validation (step 4), layout (step 5), editing, and diffing all read from. If this model is wrong, every later step inherits the error.

---

## 2. In scope

- Pydantic v2 models for: `ArchitectureDraft`, `Architecture`, `Component`, `Connection`, `Group`, `Requirement`, `Assumption`, `Flag`, `RunMeta`.
- Enums: 14 component types, 2 connection types, requirement kind, flag kind/severity, assumption scope.
- Constrained element IDs with per-kind prefixes.
- The `Traced` mixin: `requirement_refs`, boolean `assumed`, `rationale`, with invariants.
- Reserved-key validation inside the string `attributes` map.
- Group rules: one group per component, one level of nesting.
- Soft referential integrity check (`check_references()`) returning structured issues, never raising.
- JSON Schema export for both the generation contract and the stored record.
- Two fixtures: small, and full-coverage of all 14 component types.
- Unit tests for every invariant.

## 3. Out of scope

- AI client, model config, prompt templates, retries (step 3).
- Evaluation prompts and rubrics (step 2).
- networkx graph semantics: disconnected components, sync cycles, invalid type pairings, missing required links (step 4).
- elkjs, React Flow, coordinates, sizes, colors, edge routing, styling (step 5).
- SQLite persistence and table design.
- Frontend type generation from the schema (step 5).
- Any UI, any deployment, auth, rate limiting, or clustering.

---

## 4. Inputs from earlier steps

No code exists yet. Inputs are documents only:

- Project document v1.2 — Section 8 (build baseline: 14 types, 2 connection types, generic types with optional technology label, deterministic validation only, local only), Section 4 (typed model as foundation, AI never decides coordinates), Section 5 (traceability, visible assumptions, ask-or-flag), Section 11 (start with the data model).
- Approved step 1 updates (this revision): envelope fields excluded from AI output, blocking flags are delivered-but-unresolved, two fixtures, reserved attribute keys, boolean `assumed`, group cardinality.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  backend\
    pyproject.toml                              # pydantic v2, pytest only
    app\model\
      __init__.py                               # public re-exports
      enums.py                                  # ComponentType(14), ConnectionType(2), RequirementKind, FlagKind, Severity, AssumptionScope, Domain
      ids.py                                    # RequirementId, ComponentId, ConnectionId, GroupId, AssumptionId, FlagId
      trace.py                                  # Traced mixin + invariants
      attributes.py                             # reserved-key validation for the string map
      requirement.py
      component.py
      connection.py
      group.py
      assumption.py                             # Assumption + Flag
      meta.py                                   # RunMeta + envelope
      architecture.py                           # ArchitectureDraft, Architecture, check_references()
      issues.py                                 # Issue / IssueKind (soft-check results)
      export_schema.py                          # python -m app.model.export_schema
    tests\
      test_model.py
      test_schema.py
      fixtures\small_architecture.json
      fixtures\full_coverage_architecture.json
  schema\
    architecture.generation.schema.json         # what the AI emits — no envelope
    architecture.stored.schema.json             # full record, envelope injected
```

---

## 6. Model shape

Strict base config on every model: `extra="forbid"`, enums by value, no defaults on semantically required fields, `max_length` caps on every string and list.

### 6.1 Two models, one graph

```python
class ArchitectureDraft(BaseModel):          # exactly what the AI emits
    title: str
    summary: str
    requirements: list[Requirement]          # 1..40
    components: list[Component]              # 1..120
    connections: list[Connection]            # 0..300
    groups: list[Group]                      # 0..20
    assumptions: list[Assumption]            # 0..40
    flags: list[Flag]                        # 0..20

class Architecture(ArchitectureDraft):       # stored record
    schema_version: Literal["1.0"]           # injected by harness
    prompt: str                              # injected verbatim
    domain: Literal["web_backend"]           # injected, fixed in v1
    meta: RunMeta                            # injected: provider, model, base_url, generated_at
```

The AI never generates `schema_version`, `prompt`, `domain`, or `meta`. `architecture.generation.schema.json` is generated from `ArchitectureDraft` only and is the only schema shown to the model. Inheritance guarantees the stored schema is a strict superset, and a test asserts the four envelope keys are absent from the generation schema.

### 6.2 Traced mixin — on Component, Connection, Group

```python
requirement_refs: list[RequirementId]        # [] allowed only when assumed is True
assumed: bool                                # required, no default
rationale: str | None
```

Invariants:
- `assumed is False` → `requirement_refs` non-empty. Nothing appears as fact without a basis.
- `assumed is True` → `rationale` non-empty. Assumptions are stated, never hidden.

### 6.3 Elements

| Model | Fields |
|---|---|
| `Component` | `id`, `type: ComponentType`, `name`, `technology: str \| None`, `description`, `attributes: dict[str, str]`, + Traced |
| `Connection` | `id`, `from: ComponentId`, `to: ComponentId`, `type: ConnectionType`, `label` (required, non-empty), `technology: str \| None`, + Traced |
| `Group` | `id`, `name`, `description`, `members: list[ComponentId]`, `parent_id: GroupId \| None`, + Traced |
| `Requirement` | `id`, `text`, `kind: functional \| non_functional \| constraint`, `source: prompt \| inferred` |
| `Assumption` | `id`, `text`, `scope: global \| element`, `element_refs: list[str]`, `rationale` |
| `Flag` | `id`, `kind: contradiction \| underspecified \| unverifiable`, `description`, `requirement_refs`, `severity: blocking \| warning`, `resolved_by: AssumptionId \| None` |

`technology` is the optional concrete label (`type: message_queue`, `technology: "Kafka"`) — the v1 abstraction level from Section 8.

### 6.4 Reserved attribute keys

`attributes` stays `dict[str, str]`; all values are strings. Three keys are validated, all other keys are free-form:

| Key | Rule |
|---|---|
| `replicas` | string that parses as a non-negative integer (`"3"`, not `"three"`, not `3`) |
| `protocol` | one of a short fixed list (see Decisions) |
| `consistency` | one of a short fixed list (see Decisions) |

Validation is by **value shape only**, not by component type — no per-type typed models in v1.

### 6.5 IDs

Prefixed, pattern-constrained: `req_`, `cmp_`, `cnx_`, `grp_`, `asm_`, `flg_` followed by `[a-z0-9_]{1,40}`. Uniqueness is enforced within each collection. Prefixes make dangling references self-evident in error messages and make cross-collection collisions impossible.

### 6.6 Enums (frozen)

`ComponentType` — exactly 14: `client, api_gateway, load_balancer, service, worker, database, cache, message_queue, object_storage, cdn, auth_provider, search_index, scheduler, external_service`.

`ConnectionType` — exactly 2: `sync, async`.

These are frozen because step 4's type-pairing matrix and step 5's renderer both key off them.

### 6.7 Soft integrity — `check_references()`

Returns `list[Issue]` and **never raises** for semantic problems: dangling `from`/`to`, unknown group member, component in two groups, group nesting deeper than one level, parent group that is not a group, self-referencing group, unknown `requirement_refs`, unknown `resolved_by`, `element_refs` pointing at nothing.

Division of responsibility:

| Layer | Owns |
|---|---|
| Pydantic model | well-formedness — enum membership, unknown fields, ID shape/uniqueness, size caps, traceability and assumption invariants, reserved attribute values |
| `check_references()` | soft referential integrity, reported as issues |
| networkx (step 4) | graph semantics — disconnection, sync cycles, type pairings, missing required links |

Hard-fail on shape; report on meaning. If the model raised on a dangling edge, step 4 could never explain the problem to the user.

---

## 7. Measurable acceptance criteria

1. `python -m app.model.export_schema` writes both schema files to `schema\` and exits 0.
2. `architecture.generation.schema.json` contains no `prompt`, `schema_version`, `domain`, or `meta` property at the root; `architecture.stored.schema.json` contains all four.
3. The generation schema's `ComponentType` enum has exactly 14 values matching the list in 6.6; `ConnectionType` exactly 2.
4. Both schemas are valid JSON Schema draft 2020-12 (validated in-test).
5. Neither schema contains any of the keys `x`, `y`, `position`, `width`, `height`, `color`, `style`, `layout` — no geometry or styling anywhere.
6. Both fixtures parse into `ArchitectureDraft` and `Architecture` and round-trip without data loss.
7. `full_coverage_architecture.json` instantiates all 14 component types at least once; a test asserts the set of types used equals the enum exactly.
8. Every one of the 14 tests in Section 8 passes with `pytest -q`.
9. Committed schema files match regenerated output byte-for-byte (drift test).
10. A draft containing a `blocking` flag parses successfully and is not rejected — blocking is metadata, not failure.

---

## 8. Tests (`backend/tests/test_model.py`, `test_schema.py`)

1. Small fixture parses and round-trips.
2. Full-coverage fixture parses; used component types == all 14.
3. Unknown component type rejected.
4. Unknown field rejected (`extra="forbid"`).
5. Missing `assumed` rejected.
6. `assumed=False` with empty `requirement_refs` rejected.
7. `assumed=True` with empty/absent `rationale` rejected.
8. Duplicate component IDs rejected; duplicate connection IDs rejected.
9. `attributes["replicas"] = "many"` rejected; `"0"` and `"3"` accepted.
10. `attributes["protocol"] = "carrier-pigeon"` rejected; a listed value accepted.
11. `check_references()` returns issues (no exception) for: dangling connection endpoint, unknown group member, unknown requirement ref, component in two groups, group nested two levels deep.
12. Blocking flag parses without error; `severity: blocking` with a non-null `resolved_by` rejected.
13. Generation schema root property set is exactly the 8 draft keys.
14. Both schemas validate as draft 2020-12; no geometry/style keys present; committed files match regenerated output.

---

## 9. Edge cases and risks

- **Free-model attribute typing.** A model emitting `{"replicas": 3}` (integer) fails strict `dict[str, str]`. Correct behaviour — it is a schema-invalid generation and step 3 counts it as such. Do not soften the type to make numbers pass.
- **Blocking flags vs. delivery.** The document is still returned with `severity: blocking` and `resolved_by: null`. Neither the model nor step 3 may treat this as a failed run; step 3 records it separately. The eval set in step 2 must decide how blocking flags affect a rubric score, and that decision must not be made to inflate results.
- **Enum drift.** If step 4 needs a new type pairing or step 5 a new node shape, the enum must not silently grow. Test 14 pins the counts.
- **Group semantics.** One group per component and one level of nesting are enforced, but membership is soft-checked, not hard-rejected, so step 4 can report it. A component in two groups must produce an issue, not a crash.
- **Empty connections.** A single-component architecture is legal (0 connections). No code may assume at least one edge.
- **Requirement coverage.** The model can verify that every element cites an existing requirement; it cannot verify that the citation is honest. That is the rubric's job (step 2), and the model must not pretend otherwise.
- **Schema superset via inheritance.** Adding envelope fields by subclassing is convenient but means field-order and `required` lists differ between the two files. The drift test pins both, so accidental divergence fails loudly.
- **Over-strict IDs.** Prefix requirements are a real retry cost on free models. Accepted deliberately: readable dangling-reference errors are worth it, and step 3 measures the cost.

---

## 10. Decisions — resolved 12 November 2026

1. **Two-model split — confirmed.** `ArchitectureDraft` (AI output) and `Architecture(ArchitectureDraft)` (stored). Two schema artifacts; a test proves the envelope keys are absent from the generation schema.
2. **`domain` is injected — confirmed.** The AI never emits it.
3. **Vocabularies — confirmed with `other` and `not_applicable`.** `protocol`: `http, https, grpc, websocket, tcp, sql, amqp, other`; `consistency`: `strong, eventual, causal, not_applicable`. Both validated.
4. **Reserved keys are global — confirmed.** Not scoped by component type. Type-fit checks belong to step 4 as soft issues.
5. **Blocking flag — confirmed.** Metadata, not failure; a draft containing one parses cleanly. `severity: blocking` requires `resolved_by: null`. Scoring rules are a step 2 concern (see Section 11).
6. **Attribute values stay strings — confirmed.** `replicas` is validated as a non-negative integer string.
7. **Boolean `assumed` + `rationale` — confirmed.** One group per component, one level of nesting, enforced as soft issues.

---

## 11. Step 2 handoff — blocking flags

Step 2 (evaluation set) must score blocking flags **in both directions**:

- On a **contradictory prompt**, emitting a blocking flag is correct and must earn credit. A design that silently absorbs the conflict is a hallucination under Section 5 ("silent acceptance of contradictory or impossible requirements") and must be penalised, even if the diagram looks tidy.
- On a **clean prompt**, a blocking flag is spurious and must be penalised. Free models can otherwise farm credit by flagging everything.
- A blocking flag never suppresses the architecture: the document is still delivered, and both the harness (step 3) and the rubric count the flag separately from schema validity.

This is a scoring rule for step 2. Nothing in step 1 implements or pre-empts it.

---

## 12. Step 3 handoff — retry telemetry for the blocking-flag rule

The harness must record how often the model's output is rejected **only** because of the
`severity: blocking` requires `resolved_by: null` rule (project decision 5). Track, per model:

- total generation attempts and schema-invalid attempts;
- attempts whose only violation was `blocking flag cannot be resolved by an assumption`;
- whether a retry after that specific violation succeeded, and on which attempt.

Rationale: this rule is a deliberate quality gate, not a formatting nicety. If a free model
repeatedly emits `blocking` + `resolved_by`, that is evidence about how well it models
"unresolved", and it must be visible in the step 3 report rather than absorbed into a retry
count. The rule is never relaxed to reduce retries; if a model cannot satisfy it, that model
fails evaluation and another is tried.

---

## 13. Stop condition

On approval of this plan I implement only the deliverables in Section 5, run the tests, and report each acceptance criterion with real output. I do not start step 2, do not write the evaluation set, do not build the harness, and do not touch `docs/prompts/`.

After the report I stop and wait for **approved** before drafting step 2.
