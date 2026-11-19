# Step 4 — Deterministic Graph Validators

**Step prompt · v1 draft · 19 November 2026 · for review**
**Source of truth:** project document v1.2 §4.4, §5, §6.7, §8.7, §8.8; `docs/step-1-data-model.md` §6.7 and §9; `docs/prompts/step-3-harness.md` §3 and §5.5.

> DRAFT. No code is written until this prompt is corrected and approved. Step 5 and the scored run wait for separate approval.

---

## 1. Goal

Build a standalone, deterministic graph validator for `ArchitectureDraft` that reports the five v1 checks — disconnected components, dangling connections, invalid type pairings, synchronous cycles, and missing required links — as soft `Issue`s, and never raises for a graph problem.

The type-pairing matrix and the required-link rules live in a data file, not in code, so they can be reviewed and changed without touching validator logic.

This step ends with a tested module and a proposed rules file. It is **not** wired into generation, retry, the harness, the runner, the evaluator, or the report.

---

## 2. In scope

- A standalone `app.validation` package with a rule loader, a data file, and one public entry point.
- The five checks, each returning `Issue` objects, never raising for a graph problem.
- A severity split on `Issue`: `invalid` for objectively broken structures, `judgment` for arguable ones.
- A data-driven type-pairing matrix and required-link rules, proposed in §6 for review.
- Unit tests on both existing fixtures, deliberately broken variants for every check, a sync-vs-async cycle test, data-file validation, and a 120-component performance test.
- A small, backward-compatible extension to the step-1 `Issue` model and its enum.
- `networkx` as the graph library, per the project stack.

## 3. Out of scope

- Wiring the validators into generation, retry, the harness, the runner, the evaluator, the report, or the scratch runner.
- Any change to `eval/`, `prompts/system/`, `eval/freeze.json`, or `backend/app/eval/`.
- Any model call, provider call, scored run, or scratch run.
- AI critique, judgment calls beyond the data-driven `judgment` issues, or any LLM judge.
- Layout, coordinates, rendering, or geometry (step 5).
- Auto-fixing, deleting, or rewriting graph elements. Validators report only.
- New component types, new connection types, new architecture fields, or schema changes.
- Deriving rules from the evaluation rubrics. The rules come from the project document and general web/backend practice only.
- Changing the pass bar, the evaluator, or any frozen artifact.

---

## 4. Inputs from earlier steps

- `backend/app/model/architecture.py` — `ArchitectureDraft`, `check_references()`, component/connection collections.
- `backend/app/model/issues.py` — the soft `Issue` model to extend.
- `backend/app/model/enums.py` — `ComponentType` (14 values), `ConnectionType` (2 values), `IssueKind`.
- `backend/app/model/component.py`, `connection.py` — the fields the checks read.
- `backend/tests/fixtures/small_architecture.json` and `full_coverage_architecture.json` — the two clean fixtures.
- `docs/step-1-data-model.md` §6.7 — division of responsibility: model = well-formedness, `check_references()` = soft referential integrity, networkx = graph semantics.
- `docs/step-1-data-model.md` §9 — a single-component architecture with zero connections is legal.
- Project document v1.2 §4.4 — deterministic rule checks versus judgment calls kept separate.
- Project document v1.2 §8.7 — the five checks; §8.8 — asynchronous loops are allowed, synchronous cycles are flagged.
- `docs/prompts/step-3-harness.md` §3 — validators were explicitly out of scope for step 3; §5.5 — `app/eval/evaluate.py` must remain `networkx`-free.
- `backend/pyproject.toml` — package list and dependencies.

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  backend\app\validation\
    __init__.py                 # re-exports validate_graph, load_rules, RuleSet, RulesError
    rules.py                    # Pydantic models for rules.json, loader, validation
    rules.json                  # the type-pairing matrix and required-link rules
    validators.py               # the five checks; no rule literals
  backend\tests\
    test_graph_rules.py         # data-file schema, coverage, consistency, data-driven proof
    test_validators.py          # fixtures, broken variants, cycles, severity, performance, no wiring
  backend\app\model\
    enums.py                    # + IssueSeverity; + six IssueKind values
    issues.py                   # + severity field, default invalid
  backend\pyproject.toml        # + app.validation package; + networkx dependency
  docs\step-1-data-model.md     # §6.7 note on the severity split and validator ownership
```

No other file changes. In particular, no file under `eval/`, `prompts/system/`, `backend/app/eval/`, or `backend/app/llm/` is touched.

### 5.1 Public API

```python
from app.validation import RuleSet, RulesError, load_rules, validate_graph

issues: list[Issue] = validate_graph(draft)              # shipped rules
issues = validate_graph(draft, rules=load_rules(path))   # explicit rules
```

- `validate_graph(draft, rules=None) -> list[Issue]`.
- `rules=None` loads the packaged `rules.json` once and caches it.
- A graph problem is returned as an `Issue`; it never raises.
- A malformed or inconsistent `rules.json` raises `RulesError` with the file path and the rule id. That is a configuration error, not a graph problem.
- The function is pure: same draft plus same rules gives an equal list in the same order.

### 5.2 Severity on `Issue`

`backend/app/model/enums.py` gains:

```python
class IssueSeverity(str, Enum):
    INVALID = "invalid"      # objectively broken structure
    JUDGMENT = "judgment"    # arguable; report, do not reject
```

`backend/app/model/issues.py` gains `severity: IssueSeverity = IssueSeverity.INVALID`.

The default preserves every existing `check_references()` finding as `invalid`. The flag `Severity` enum (`blocking` / `warning`) is **not** reused: a structural error must not be confused with a contradictory-requirement flag.

### 5.3 New issue kinds

`IssueKind` gains exactly six values:

```
disconnected_component
disconnected_graph
invalid_type_pairing
questionable_type_pairing
synchronous_cycle
missing_required_link
```

Dangling connections reuse the existing `dangling_connection_source` and `dangling_connection_target` kinds. No existing kind is renamed or removed.

### 5.4 Check order

`validate_graph` returns issues in this fixed order, and in model order within each check:

1. referential issues from `draft.check_references()` (includes dangling connections);
2. disconnected components;
3. type pairings;
4. synchronous cycles;
5. missing required links.

SCCs and id lists are sorted before they are rendered, so output is deterministic.

---

## 6. Proposed rule data (for review)

This section is the review surface. The implementation writes exactly these rules into `backend/app/validation/rules.json`; no pairing or required-link type list is hardcoded in `validators.py`.

### 6.1 File shape

```json
{
  "version": "1.0",
  "pairing_default": "allowed",
  "pairings": [
    {"from": "client", "to": "database", "severity": "invalid",
     "reason": "clients do not hold database credentials; data access goes through a service"}
  ],
  "required_links": [
    {"id": "database_accessor", "applies_to": "database", "direction": "in",
     "counterpart_types": ["service", "worker", "database"],
     "min_connections": 1, "severity": "invalid",
     "reason": "a database must be read or written by application compute"}
  ]
}
```

- `pairing_default: "allowed"` means an unlisted pair is allowed. The file is a sparse deny/warn matrix, not a 196-row allowlist.
- `pairings` entries are unique by `(from, to)`. A duplicate, an unknown type, or an unknown severity fails the loader.
- `required_links` entries are unique by `id`. `direction` is `in`, `out`, or `either`. `min_connections` is at least 1.
- `severity` is `invalid` or `judgment`, matching `IssueSeverity`.
- Every rule carries a one-line `reason`; the validator copies it into the issue message with the component/connection id.

### 6.2 Type-pairing matrix

Rows are the source type, columns the target type. `I` = invalid, `W` = warning (`judgment`), `·` = allowed. The shipped file contains only the `I` and `W` cells.

Column key: `C` client, `G` api_gateway, `L` load_balancer, `S` service, `W` worker, `D` database, `K` cache, `Q` message_queue, `O` object_storage, `N` cdn, `A` auth_provider, `X` search_index, `T` scheduler, `E` external_service.

| from \ to | C | G | L | S | W | D | K | Q | O | N | A | X | T | E |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **client** | W | · | · | · | W | **I** | W | W | · | · | · | W | W | · |
| **api_gateway** | W | W | · | · | · | **I** | · | · | · | · | · | W | W | · |
| **load_balancer** | **I** | W | W | · | · | **I** | W | W | W | W | W | · | W | W |
| **service** | · | W | W | · | W | · | · | · | · | · | · | · | · | · |
| **worker** | W | W | W | · | · | · | · | · | · | · | W | · | W | · |
| **database** | **I** | **I** | **I** | W | W | · | W | · | · | **I** | **I** | · | **I** | W |
| **cache** | **I** | **I** | **I** | W | W | **I** | · | W | **I** | **I** | **I** | **I** | **I** | **I** |
| **message_queue** | **I** | **I** | **I** | · | · | **I** | **I** | · | **I** | **I** | **I** | **I** | **I** | **I** |
| **object_storage** | · | **I** | **I** | · | · | **I** | **I** | · | · | W | **I** | **I** | **I** | W |
| **cdn** | · | · | · | · | W | **I** | W | W | · | · | W | **I** | **I** | W |
| **auth_provider** | · | W | W | · | W | W | W | W | W | W | · | **I** | **I** | · |
| **search_index** | W | **I** | **I** | W | W | **I** | **I** | W | **I** | **I** | **I** | · | **I** | W |
| **scheduler** | **I** | W | W | · | · | W | W | · | W | **I** | **I** | **I** | · | · |
| **external_service** | · | · | W | · | · | **I** | **I** | · | · | W | · | **I** | **I** | · |

The invalid cells are limited to pairings that are wrong in nearly all web/backend designs: a client, gateway, or load balancer talking directly to a database; a database, cache, queue, or object store acting as a caller of application or platform services it does not drive (for example, a cache calling a service, a queue calling a database, or storage calling a gateway); a CDN calling a database, queue, auth provider, search index, or scheduler; a search index calling a gateway, load balancer, database, cache, storage, CDN, auth provider, or scheduler; and a scheduler calling a client, CDN, auth provider, or search index. Everything arguable is `W`, including client-to-cache, client-to-queue, service-to-worker, database-to-service, and CDN-to-worker.

The full-coverage fixture contains an async cycle (`queue → transcoder → queue`), no synchronous cycle, and no `I` or `W` cell. The small fixture contains no `I` or `W` cell. Both clean fixtures must therefore produce zero issues.

### 6.3 Required-link rules

`applies_to` is the component type that triggers the rule. `direction` is the direction of the required edge relative to that component. A rule passes when at least `min_connections` edges exist from/to any `counterpart_types` value. Same-type chaining and replication are included where the matrix allows them, so the two data-driven checks cannot contradict each other.

| id | applies_to | dir | counterpart_types | severity | why |
|---|---|---|---|---|---|
| `api_gateway_backend` | api_gateway | out | service, worker, load_balancer, api_gateway | invalid | a gateway with no backend routes nowhere |
| `load_balancer_backend` | load_balancer | out | service, worker, load_balancer | invalid | a load balancer with no backend balances nothing |
| `database_accessor` | database | in | service, worker, database | invalid | a database must be read or written by application compute; replication counts as a link |
| `cache_accessor` | cache | in | service, worker, api_gateway, cache | invalid | a cache with no reader or writer is dead weight |
| `queue_producer` | message_queue | in | service, worker, api_gateway, scheduler, external_service, database, object_storage, message_queue | invalid | a queue with no producer never receives work |
| `queue_consumer` | message_queue | out | service, worker, message_queue | invalid | a queue with no consumer never drains |
| `object_storage_accessor` | object_storage | in | service, worker, cdn, api_gateway, client, external_service, object_storage | invalid | storage with no accessor is unused |
| `cdn_origin` | cdn | out | service, api_gateway, load_balancer, object_storage, external_service, cdn | invalid | a CDN with no origin cannot serve |
| `scheduler_target` | scheduler | out | service, worker, message_queue, external_service, scheduler | invalid | a scheduler with no target triggers nothing |
| `worker_input` | worker | in | message_queue, service, scheduler, database, object_storage, external_service, worker | invalid | a worker with no input never runs |
| `service_caller` | service | in | client, api_gateway, load_balancer, scheduler, worker, external_service, service, message_queue, cdn, object_storage, auth_provider | invalid | a service with no caller is unused |
| `external_service_caller` | external_service | in | client, api_gateway, service, worker, scheduler, external_service | invalid | an external service with no caller is unused |
| `auth_provider_used` | auth_provider | either | client, api_gateway, service, external_service, auth_provider | judgment | auth may be delegated outside the diagram; flag for review, do not reject |
| `search_index_writer` | search_index | in | service, worker, database, search_index | judgment | an index may be populated by an unshown pipeline; flag for review, do not reject |

Deliberately omitted:

- **`client_entry`.** An unused client is already an isolated component; a client's outgoing edge types are already covered by the pairing matrix. Adding it would double-report.
- **`search_index_reader`.** One directed connection can represent both indexing and querying (the full fixture's `api → search_index` is labelled “index queries”). Requiring a separate reader would flag a clean fixture.
- **`scheduler → database` as a database accessor.** The matrix marks that pairing `W`, but a scheduler writing job state directly is unusual enough that it should not satisfy the database-accessor rule. The consistency rule below forbids a required link from being satisfiable only by an `invalid` pairing; it does not force every `W` pairing into a rule.

### 6.4 Consistency invariant

The loader rejects a rule when any counterpart pairing would be `invalid` in the matrix:

- `direction: "out"` checks `(applies_to, counterpart)`;
- `direction: "in"` checks `(counterpart, applies_to)`;
- `direction: "either"` checks both.

This is tested. It is what keeps “invalid type pairing” and “missing required link” from telling the user opposite things.

### 6.5 Check-to-issue mapping

| check | issue kind | severity | element_id |
|---|---|---|---|
| dangling connection | `dangling_connection_source` / `dangling_connection_target` (reused) | invalid | connection id |
| isolated component in a multi-component graph | `disconnected_component` | invalid | component id |
| more than one connected group, no isolated node | `disconnected_graph` | judgment | `null` |
| invalid pairing | `invalid_type_pairing` | invalid | connection id |
| questionable pairing | `questionable_type_pairing` | judgment | connection id |
| synchronous cycle | `synchronous_cycle` | invalid | smallest component id in the SCC |
| missing required link | `missing_required_link` | rule severity | component id |

### 6.6 Algorithms

**Dangling connections.** Delegated to `draft.check_references()`. The validator does not re-implement endpoint checks; it converts those issues (already `invalid` by default) and returns them first. This also surfaces the other soft referential issues, which is desirable and is not a new rule.

**Disconnected components.** Build an undirected graph over `draft.components`, adding only connections whose `from` and `to` both exist. If there is exactly one component, no issue (single-component architecture is legal). If there are several and a component has degree 0, emit one `disconnected_component` per isolated component. If there are several and no component has degree 0, emit one `disconnected_graph` judgment naming the groups. Do not emit `disconnected_graph` when isolated issues already explain the split.

**Type pairings.** For each connection whose endpoints both exist, look up `(from.type, to.type)`. Emit `invalid_type_pairing` or `questionable_type_pairing` with the rule's reason. Skip connections with unknown endpoints here; the dangling check owns them.

**Synchronous cycles.** Build a directed graph of `sync` connections only, with both endpoints known. Compute strongly connected components. Any SCC of size > 1, or a size-1 SCC with a self-loop, is one `synchronous_cycle` invalid issue. This is linear in the graph and avoids enumerating simple cycles, which is exponential. Because async edges are excluded, any cycle containing at least one async edge is allowed. Async-only and mixed cycles produce no issue.

**Missing required links.** For each component, skip the rule if the component has degree 0 in the valid graph (the disconnected check owns it). Otherwise, for every rule whose `applies_to` matches the component type, count matching edges in the rule's direction to any counterpart type. If the count is below `min_connections`, emit `missing_required_link` with the rule's severity. One issue per component per failed rule.

### 6.7 Message bounds and determinism

- Every `Issue.message` is at most 400 characters. Long id lists are truncated with “and N more”.
- Component ids, connection ids, SCCs and group lists are sorted before rendering.
- `validate_graph` returns a new list each call; callers may mutate it without affecting the cache.
- `load_rules()` returns an immutable `RuleSet`; two loads of the same file compare equal.

---

## 7. Measurable acceptance criteria

1. `backend/app/validation/` exists with `__init__.py`, `rules.py`, `rules.json`, `validators.py`, and exports `validate_graph`, `load_rules`, `RuleSet`, `RulesError`.
2. `validate_graph(draft)` returns `list[Issue]` for both clean fixtures and returns `[]` for both.
3. The five checks are each proven by a test: disconnected, dangling, invalid pairing, synchronous cycle, missing required link.
4. Dangling connections reuse `dangling_connection_source` / `dangling_connection_target`; no duplicate endpoint logic exists in `validators.py`.
5. `IssueSeverity` exists with `invalid` and `judgment`; `Issue.severity` defaults to `invalid`; every pre-existing `check_references()` finding still validates and is `invalid`.
6. The type-pairing matrix and required-link rules exist only in `rules.json`; changing a temporary rules file changes `validate_graph` behaviour, proving the rules are data.
7. The loader rejects an unknown component type, a duplicate pairing, a duplicate rule id, an unknown severity, `min_connections < 1`, an unknown direction, and a required link whose counterpart pairing is `invalid`.
8. The shipped matrix marks `client → database` invalid and marks at least one arguable pairing (for example `client → cache`) as `judgment`.
9. A synchronous cycle is reported once per SCC with severity `invalid`; an async-only cycle and a mixed cycle produce no `synchronous_cycle`; a sync self-loop is reported.
10. A 120-component, 300-connection clean graph validates with p95 < 500 ms over repeated runs, and a 120-node sync ring validates with p95 < 500 ms and exactly one `synchronous_cycle`.
11. `app.validation` imports only `app.model`, the standard library and `networkx`; it does not import `app.eval` or `app.llm`.
12. `app/eval/evaluate.py`, `app/eval/runner.py`, `app/llm/generate.py` and the retry path do not import `app.validation`; the evaluator is unchanged.
13. `app/eval/evaluate.py` still contains no `networkx` import.
14. `backend/pyproject.toml` lists `app.validation` under `[tool.setuptools] packages` and `networkx` under dependencies.
15. `python -m pytest -q` is green, including all existing tests, with the new tests added.
16. No file under `eval/`, `prompts/system/`, `backend/app/eval/`, or `backend/app/llm/` is modified; `eval/freeze.json` still has `scored_run_approved: false`.
17. The changes are committed and pushed to `origin/main`.

---

## 8. Tests

### `backend/tests/test_graph_rules.py`

1. `rules.json` loads; `version == "1.0"`; `pairing_default == "allowed"`.
2. Every `from`, `to`, `applies_to` and `counterpart_types` value is a real `ComponentType`.
3. No duplicate `(from, to)` pairing; no duplicate rule `id`; every pairing has a non-empty reason.
4. Every severity is `invalid` or `judgment`; every direction is `in`, `out`, or `either`; every `min_connections >= 1`.
5. Every component type appears at least once as a pairing source, a pairing target, an `applies_to`, or a counterpart.
6. **Consistency:** for every required link and every counterpart type, the implied pairing is not `invalid`. The test fails with the rule id and the offending pair.
7. A temp rules file with an unknown type is rejected; a duplicate pair is rejected; a required link with an invalid counterpart is rejected.
8. A temp rules file that marks `client → service` invalid changes `validate_graph(small)`; the shipped rules do not. This proves the data-driven path.
9. Two `load_rules()` calls compare equal and return immutable data.

### `backend/tests/test_validators.py`

1. Both clean fixtures return `[]`.
2. **Disconnected, isolated:** add a service with no connections to the small fixture; assert one `disconnected_component`, severity `invalid`, correct `element_id`.
3. **Disconnected, split:** remove the gateway-to-service bridge and add an intra-cluster edge so no node is isolated; assert one `disconnected_graph`, severity `judgment`, and no `disconnected_component`.
4. **Single component:** a one-component draft with zero connections returns `[]` (legal per step-1 §9).
5. **Dangling source/target:** change one endpoint to a ghost id; assert the existing dangling kind, severity `invalid`, and the connection id.
6. **Invalid pairing:** add `client → database` to the small fixture; assert `invalid_type_pairing`, severity `invalid`, connection id, and both type names in the message.
7. **Questionable pairing:** add `client → cache`; assert `questionable_type_pairing`, severity `judgment`.
8. **Sync cycle:** add a sync `database → service` edge to the small fixture; assert one `synchronous_cycle`, severity `invalid`, and the SCC members.
9. **Async cycle allowed:** add the same edge as `async`; assert no `synchronous_cycle`.
10. **Mixed cycle allowed:** a three-node graph with `A → B` sync, `B → C` sync, `C → A` async returns no sync cycle; changing `C → A` to sync returns one.
11. **Sync self-loop:** a component with a sync edge to itself returns one `synchronous_cycle`.
12. **Async self-loop:** the same edge as `async` returns no sync cycle.
13. **Missing required link, invalid:** remove `queue → transcoder` from the full fixture; assert `missing_required_link` on the queue, severity `invalid`, and no `disconnected_component` for it (it still has a producer).
14. **Missing required link, judgment:** remove `api → search_index` and add `search_index → api`; assert `missing_required_link` on the index, severity `judgment`, plus the questionable pairing.
15. **Isolated suppression:** remove every connection touching a database; assert `disconnected_component` and no `missing_required_link` for that database.
16. **Severity default:** a bare `Issue(kind=..., message=...)` is `invalid`; a `check_references()` issue is `invalid`.
17. **Determinism:** two calls on the same broken draft return equal lists in the same order; two `load_rules()` loads behave identically.
18. **Message bound:** a 120-node sync ring and a 120-isolated-component graph produce only messages of at most 400 characters, with truncation noted.
19. **No wiring:** source scan of `app/eval/evaluate.py`, `app/eval/runner.py`, `app/llm/generate.py`, and `app/llm/scratch_runner.py` finds no `app.validation` or `validate_graph` import; source scan of `app/validation` finds no `app.eval` or `app.llm` import.
20. **Evaluator untouched:** `app/eval/evaluate.py` still has no `networkx` import.
21. **Performance, clean:** build 120 components and 300 connections (one client, 119 services, a sync DAG plus extra forward edges). Assert `[]`; run 100 times; assert p95 < 500 ms; print median and p95.
22. **Performance, sync ring:** 120 services in a sync ring; run 50 times; assert exactly one `synchronous_cycle` and p95 < 500 ms.
23. **Performance, isolated:** 120 components with no connections; run 50 times; assert 120 `disconnected_component` issues and p95 < 500 ms.

---

## 9. Edge cases and risks

- **Separate subsystems are not always wrong.** Multiple connected groups may be a legitimate design (for example, an admin plane and a public plane). They are a `judgment` issue, not `invalid`. An isolated component in a multi-component graph is `invalid`.
- **A single-component architecture is legal.** The disconnected check must not flag a one-component draft with zero connections. This is pinned by step-1 §9 and by test 4.
- **Dangling edges create phantom connectivity.** Build the graph from connections whose endpoints both exist. A component connected only by dangling edges is isolated; it gets both the dangling issue and the disconnected issue. That is correct.
- **Required links versus invalid pairings.** A required link must never be satisfiable only by an `invalid` pairing. The loader enforces this; without it, the two checks would contradict each other.
- **Required links on isolated components.** They are suppressed because the disconnected check already reports the component. A component connected only by a questionable pairing still gets the missing-link issue.
- **Cycle enumeration can explode.** Use SCCs, not `simple_cycles`. A 120-node sync ring must be linear and must produce one issue, not 120.
- **Async is not a weaker sync.** Excluding async edges from the cycle graph is the whole rule. A mixed cycle is allowed; only a cycle made entirely of sync edges is invalid.
- **Over-marking the matrix.** The matrix is a proposal. Only pairings wrong in nearly all designs are `invalid`; everything arguable is `judgment`. The product owner reviews the table before implementation.
- **Rules derived from rubrics.** None. The rules come from the project document and general practice. The eval set is not read, imported, or parsed by this module or its tests.
- **Accidental wiring.** The validator must not be imported by generation, retry, the harness, the runner, or the evaluator. Source scans pin this.
- **Step-3 networkx rule.** Step 3 forbade `networkx` outside `evaluate.py`. Step 4 intentionally introduces it in `app.validation` only; `app.eval.evaluate` stays free of it.
- **Data-file drift.** The loader validates the file on every load; the consistency test pins the two rule sets against each other.
- **Severity confusion.** `IssueSeverity.invalid/judgment` is not `Severity.blocking/warning`. A structural error must not look like a contradictory-requirement flag.
- **Message overflow.** `Issue.message` is capped at 400 characters; long SCC or group lists are truncated deterministically.

---

## 10. Decisions for you

Fixed by this draft unless you change them:

1. **Severity model.** A new `IssueSeverity` (`invalid`, `judgment`) on the existing `Issue`, defaulting to `invalid`. This keeps one soft-issue mechanism and one return type. The alternative is a separate `ValidationIssue` subclass; I recommend against it because callers would then handle two types. The flag `Severity` (`blocking`, `warning`) is not reused.
2. **Dangling delegation.** `validate_graph` calls `draft.check_references()` and returns those issues first, rather than re-implementing endpoint checks. This also surfaces group, requirement and assumption reference issues. If you want only dangling findings, say so; the cost is duplicated endpoint logic.
3. **Disconnected semantics.** An isolated component in a multi-component graph is `invalid`; more than one connected group with no isolated node is `judgment`; a single-component architecture is legal. This is the conservative split.
4. **Cycle semantics.** Only the `sync`-edge subgraph is checked. One issue per SCC, plus sync self-loops. Async-only and mixed cycles are allowed. SCCs are used instead of enumerating simple cycles so a 120-node ring stays linear.
5. **Type-pairing matrix.** Approve or trim the table in §6.2. The cells most likely to be debated are `load_balancer → client` (invalid), `database → service` (warning), `cache → service` (warning), `queue → client` (invalid), `object_storage → api_gateway` (invalid), `scheduler → client` (invalid), and `external_service → database` / `external_service → cache` (invalid). I am comfortable defending the invalid cells as “wrong in nearly all designs”; if you disagree on any, it becomes a warning.
6. **Required-link rules.** Approve or trim the fourteen rules in §6.3. Twelve are `invalid`; `auth_provider_used` and `search_index_writer` are `judgment` because the dependency can legitimately sit outside the diagram. `client_entry` and `search_index_reader` are deliberately omitted for the reasons given.
7. **Isolated suppression.** Missing-link rules skip components with degree 0, so the disconnected check is the single explanation for a fully isolated component. If you prefer both findings, it is a one-line change and a test update.
8. **Data file.** `backend/app/validation/rules.json`, with `pairing_default: "allowed"` and only the `I`/`W` cells encoded. The loader validates it and rejects contradictions with the required-link rules.
9. **Model touch.** `backend/app/model/enums.py` gains `IssueSeverity` and six `IssueKind` values; `backend/app/model/issues.py` gains the defaulted `severity` field; `docs/step-1-data-model.md` §6.7 gets a short note. These are backward-compatible. If you want the step-1 model left untouched, the alternative is a separate issue type in `app.validation`, at the cost of two return types.
10. **Dependency.** `networkx` is added to `backend/pyproject.toml` and `app.validation` to the package list. `app/eval/evaluate.py` remains networkx-free.
11. **Performance bar.** p95 < 500 ms on 120 components / 300 connections, 100 iterations, with the actual median and p95 reported. The bar is deliberately loose so the test measures the algorithm, not the machine.
12. **No wiring.** The validators are not imported by generation, retry, the harness, the runner, the evaluator, the report, or the scratch runner. `eval/`, `prompts/system/`, `eval/freeze.json` and `backend/app/eval/` are untouched; `scored_run_approved` stays `false`.

---

## 11. Report format

Per acceptance criterion in §7: pass or fail with real evidence. Then:

- the full `python -m pytest -v` output;
- the exact `backend/app/validation/rules.json`;
- the §6.2 matrix and §6.3 required-link table as implemented, with any change from this draft called out;
- the two clean-fixture results;
- one broken-variant result per check, showing kind, severity and `element_id`;
- the sync/async cycle table, including the self-loop cases;
- the 120-component timings: median, p95, iteration count, and issue count for clean, sync-ring and isolated graphs;
- the data-driven proof: the temp-rules run that changes behaviour;
- the source-scan output for no wiring and for `evaluate.py` remaining networkx-free;
- files created or changed;
- any deviation stated plainly.

No model is called. No scored run is made. No result is reported for a model.

---

## 12. Stop condition

I correct this draft only after your review, then implement only the paths in §5, run the offline tests, report with real evidence, commit and push to `origin/main`.

I do not wire the validators into generation, retry, the harness, the runner, the evaluator, the report or the scratch runner. I do not touch `eval/`, `prompts/system/`, `eval/freeze.json` or `backend/app/eval/`. I do not set `scored_run_approved`. I do not run any model or provider call. I do not start step 5.

Then I stop and wait for **approved** on step 4. Step 5 and the scored run wait for separate approval.
