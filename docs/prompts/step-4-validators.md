# Step 4 — Deterministic Graph Validators

**Step prompt · v2 · 19 November 2026 · approved with changes; build proceeds**
**Source of truth:** project document v1.2 §4.4, §5, §6.7, §8.7, §8.8; `docs/step-1-data-model.md` §6.7 and §9; `docs/prompts/step-3-harness.md` §3 and §5.5.

> v2 is the build contract. It records the corrections made in review. No model is called, no scored run is made, and the validators are not wired into any pipeline stage.

### Changes from v1

1. The type-pairing matrix is more conservative. Eleven cells moved from `invalid` to `judgment`: `load_balancer → database`, `api_gateway → database`, `message_queue → database`, `message_queue → object_storage`, `message_queue → search_index`, `message_queue → external_service`, `message_queue → cache`, `external_service → database`, `object_storage → database`, `cache → database`, `database → scheduler`. Every other invalid cell was re-checked against the same test and kept.
2. `queue_consumer` and `service_caller` are `judgment`. `external_service_caller` accepts either direction. The other link rules are unchanged.
3. A synchronous cycle of two or more components is `judgment`; a synchronous self-loop is `invalid`; asynchronous and mixed cycles are allowed.
4. `rules.json` carries `rules_version`.
5. Both schema artifacts in `schema/` must remain byte-identical, proven by a test comparing SHA-256 hashes.
6. Rules are derived from general system-design practice only, never from the evaluation set or model output.

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
- A data-driven type-pairing matrix and required-link rules, specified in §6.
- Unit tests on both existing fixtures, deliberately broken variants for every check, a sync-vs-async cycle test, data-file validation, a schema-hash guard, and a 120-component performance test.
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
- Deriving rules from the evaluation rubrics. The rules come from general web/backend practice only.
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
- `schema/architecture.generation.schema.json` and `schema/architecture.stored.schema.json` — the frozen artifacts that must not change.

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
    test_validators.py          # fixtures, broken variants, cycles, severity, performance, no wiring, schema hashes
  backend\app\model\
    enums.py                    # + IssueSeverity; + six IssueKind values
    issues.py                   # + severity field, default invalid
    __init__.py                 # + IssueSeverity export
  backend\pyproject.toml        # + app.validation package; + networkx dependency
  docs\step-1-data-model.md     # §6.7 note on the severity split and validator ownership
```

No other file changes. In particular, no file under `eval/`, `prompts/system/`, `backend/app/eval/`, `backend/app/llm/`, or `schema/` is modified.

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

### 5.5 Schema artifact guard

The step-1 JSON Schema artifacts are frozen. `schema/architecture.generation.schema.json` and `schema/architecture.stored.schema.json` must remain byte-identical after step 4. `Issue` is not a field of either architecture model, so the model touch in §5.2 must not change them. A test asserts both SHA-256 values against the recorded constants:

```
generation  0033E0C195B72B0E822CD4DCA8A4C3EB418AEB22765A66F04E90448A760FC89F
stored      1E9C1EE76533E1437EE7B402BE18090A82CDB4448B15E0D7CD036579981DA995
```

---

## 6. Proposed rule data (approved)

This section is the review surface. The implementation writes exactly these rules into `backend/app/validation/rules.json`; no pairing or required-link type list is hardcoded in `validators.py`.

### 6.1 File shape

```json
{
  "rules_version": "1.0",
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

- `rules_version` is required and is `"1.0"`.
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
| **api_gateway** | W | W | · | · | · | W | · | · | · | · | · | W | W | · |
| **load_balancer** | **I** | W | W | · | · | W | W | W | W | W | W | · | W | W |
| **service** | · | W | W | · | W | · | · | · | · | · | · | · | · | · |
| **worker** | W | W | W | · | · | · | · | · | · | · | W | · | W | · |
| **database** | **I** | **I** | **I** | W | W | · | W | · | · | **I** | **I** | · | W | W |
| **cache** | **I** | **I** | **I** | W | W | W | · | W | **I** | **I** | **I** | **I** | **I** | **I** |
| **message_queue** | **I** | **I** | **I** | · | · | W | W | · | W | **I** | **I** | W | **I** | W |
| **object_storage** | · | **I** | **I** | · | · | W | **I** | · | · | W | **I** | **I** | **I** | W |
| **cdn** | · | · | · | · | W | **I** | W | W | · | · | W | **I** | **I** | W |
| **auth_provider** | · | W | W | · | W | W | W | W | W | W | · | **I** | **I** | · |
| **search_index** | W | **I** | **I** | W | W | **I** | **I** | W | **I** | **I** | **I** | · | **I** | W |
| **scheduler** | **I** | W | W | · | · | W | W | · | W | **I** | **I** | **I** | · | · |
| **external_service** | · | · | W | · | · | W | **I** | · | · | W | · | **I** | **I** | · |

**Changed from v1 — every cell moved from `invalid` to `judgment`:**

| cell | why it is now a warning |
|---|---|
| `load_balancer → database` | a load balancer may health-check or proxy a database endpoint |
| `api_gateway → database` | a gateway may own a small direct datastore (BFF pattern) |
| `message_queue → database` | a queue may sink into a database through a connector |
| `message_queue → object_storage` | a queue may sink into object storage through a connector |
| `message_queue → search_index` | a queue may feed a search index through a connector |
| `message_queue → external_service` | a queue may sink into an external service through a connector |
| `message_queue → cache` | a queue may sink into a cache through a connector |
| `external_service → database` | an external service may write to a database through a webhook |
| `object_storage → database` | object storage may notify a database through an event connector |
| `cache → database` | a cache may read through to a database |
| `database → scheduler` | a database may trigger scheduled work through a job-state change |

**Re-check of the remaining invalid cells.** Every remaining `I` is a caller/callee inversion with no standard connector pattern in the web-backend domain:

- **Passive stores do not originate calls to edge or compute components.** `database`, `cache`, `search_index`, and `object_storage` do not call clients, gateways, load balancers, CDNs, auth providers, schedulers, or each other in a standard design. A store may be *called by* compute, or emit an event through a connector; the direct edge is the inversion that stays invalid.
- **Edge components do not call clients.** `load_balancer → client` and `scheduler → client` are not how inbound traffic or scheduled work is delivered.
- **A queue does not deliver directly to a client, gateway, load balancer, CDN, auth provider, or scheduler.** Delivery goes through a service or a purpose-built push component.
- **An external service does not write directly to your cache, search index, or scheduler.** Ingestion goes through your compute or a connector owned by your system.
- **`client → database` stays invalid.** A browser or mobile client bypassing the service layer to hold database credentials is wrong in nearly all web-backend designs; this is the canonical invalid cell and is pinned by a test.
- **`cache → object_storage` stays invalid.** Cache fill is driven by the compute layer, not by the cache. A caching proxy is possible but is not a standard direct edge in this component vocabulary.

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
| `queue_consumer` | message_queue | out | service, worker, message_queue | judgment | a queue with no consumer never drains; flag for review, do not reject |
| `object_storage_accessor` | object_storage | in | service, worker, cdn, api_gateway, client, external_service, object_storage | invalid | storage with no accessor is unused |
| `cdn_origin` | cdn | out | service, api_gateway, load_balancer, object_storage, external_service, cdn | invalid | a CDN with no origin cannot serve |
| `scheduler_target` | scheduler | out | service, worker, message_queue, external_service, scheduler | invalid | a scheduler with no target triggers nothing |
| `worker_input` | worker | in | message_queue, service, scheduler, database, object_storage, external_service, worker | invalid | a worker with no input never runs |
| `service_caller` | service | in | client, api_gateway, load_balancer, scheduler, worker, external_service, service, message_queue, cdn, object_storage, auth_provider | judgment | a service with no caller is unused; flag for review, do not reject |
| `external_service_caller` | external_service | either | client, api_gateway, service, worker, scheduler, external_service | invalid | an external service with no caller is unused |
| `auth_provider_used` | auth_provider | either | client, api_gateway, service, external_service, auth_provider | judgment | auth may be delegated outside the diagram; flag for review, do not reject |
| `search_index_writer` | search_index | in | service, worker, database, search_index | judgment | an index may be populated by an unshown pipeline; flag for review, do not reject |

Changes from v1: `queue_consumer` and `service_caller` are `judgment`; `external_service_caller` is `either`. All other rules are unchanged.

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
| synchronous cycle, two or more components | `synchronous_cycle` | judgment | smallest component id in the SCC |
| synchronous self-loop | `synchronous_cycle` | invalid | component id |
| missing required link | `missing_required_link` | rule severity | component id |

### 6.6 Algorithms

**Dangling connections.** Delegated to `draft.check_references()`. The validator does not re-implement endpoint checks; it converts those issues (already `invalid` by default) and returns them first. This also surfaces the other soft referential issues, which is desirable and is not a new rule.

**Disconnected components.** Build an undirected graph over `draft.components`, adding only connections whose `from` and `to` both exist. If there is exactly one component, no issue (single-component architecture is legal). If there are several and a component has degree 0, emit one `disconnected_component` per isolated component. If there are several and no component has degree 0, emit one `disconnected_graph` judgment naming the groups. Do not emit `disconnected_graph` when isolated issues already explain the split.

**Type pairings.** For each connection whose endpoints both exist, look up `(from.type, to.type)`. Emit `invalid_type_pairing` or `questionable_type_pairing` with the rule's reason. Skip connections with unknown endpoints here; the dangling check owns them.

**Synchronous cycles.** Build a directed graph of `sync` connections only, with both endpoints known. Compute strongly connected components. A sync self-loop on a node is one `synchronous_cycle` invalid issue. An SCC of size > 1 is one `synchronous_cycle` judgment issue. A node that is both in a multi-node SCC and has a self-loop produces both findings. Because async edges are excluded, any cycle containing at least one async edge is allowed. Async-only and mixed cycles produce no issue. This is linear in the graph and avoids enumerating simple cycles, which is exponential.

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
8. The shipped matrix marks `client → database` invalid and marks at least one arguable pairing (for example `client → cache`) as `judgment`; the eleven v1 invalid cells listed in §6.2 are `judgment`.
9. A synchronous cycle of two or more components is reported once per SCC with severity `judgment`; a synchronous self-loop is `invalid`; an async-only cycle and a mixed cycle produce no `synchronous_cycle`.
10. A 120-component, 300-connection clean graph validates with p95 < 500 ms over repeated runs, and a 120-node sync ring validates with p95 < 500 ms and exactly one `synchronous_cycle`.
11. `app.validation` imports only `app.model`, the standard library and `networkx`; it does not import `app.eval` or `app.llm`.
12. `app/eval/evaluate.py`, `app/eval/runner.py`, `app/llm/generate.py` and the retry path do not import `app.validation`; the evaluator is unchanged.
13. `app/eval/evaluate.py` still contains no `networkx` import.
14. `backend/pyproject.toml` lists `app.validation` under `[tool.setuptools] packages` and `networkx` under dependencies.
15. `python -m pytest -q` is green, including all existing tests, with the new tests added.
16. No file under `eval/`, `prompts/system/`, `backend/app/eval/`, `backend/app/llm/`, or `schema/` is modified; `eval/freeze.json` still has `scored_run_approved: false`.
17. Both schema artifacts in `schema/` are byte-identical to their recorded SHA-256 values, proven by a test.
18. `rules.json` contains `rules_version: "1.0"` and the loader rejects a file without it.
19. The changes are committed and pushed to `origin/main`.

---

## 8. Tests

### `backend/tests/test_graph_rules.py`

1. `rules.json` loads; `rules_version == "1.0"`; `pairing_default == "allowed"`.
2. Every `from`, `to`, `applies_to` and `counterpart_types` value is a real `ComponentType`.
3. No duplicate `(from, to)` pairing; no duplicate rule `id`; every pairing has a non-empty reason.
4. Every severity is `invalid` or `judgment`; every direction is `in`, `out`, or `either`; every `min_connections >= 1`.
5. Every component type appears at least once as a pairing source, a pairing target, an `applies_to`, or a counterpart.
6. **Consistency:** for every required link and every counterpart type, the implied pairing is not `invalid`, checking both directions for `either`. The test fails with the rule id and the offending pair.
7. A temp rules file with an unknown type is rejected; a duplicate pair is rejected; a duplicate rule id is rejected; an unknown severity is rejected; `min_connections: 0` is rejected; an unknown direction is rejected; a required link with an invalid counterpart is rejected; a file without `rules_version` is rejected.
8. A temp rules file that marks `client → api_gateway` invalid changes `validate_graph(small)`; the shipped rules do not. This proves the data-driven path. (`client → api_gateway` is used because it exists in the small fixture and is not a counterpart of any required link, so the temp file still passes the consistency check.)
9. Two `load_rules()` calls compare equal and return immutable data.

### `backend/tests/test_validators.py`

1. Both clean fixtures return `[]`.
2. **Disconnected, isolated:** add a service with no connections to the small fixture; assert one `disconnected_component`, severity `invalid`, correct `element_id`, and no missing-link issue for it.
3. **Disconnected, split:** add an unconnected client → service pair to the small fixture so there are two connected groups and no isolated node; assert one `disconnected_graph`, severity `judgment`, and no `disconnected_component`.
4. **Single component:** a one-component draft with zero connections returns `[]` (legal per step-1 §9).
5. **Dangling source/target:** change one endpoint to a ghost id; assert the existing dangling kind, severity `invalid`, and the connection id.
6. **Invalid pairing:** add `client → database` to the small fixture; assert `invalid_type_pairing`, severity `invalid`, connection id, and both type names in the message.
7. **Questionable pairing:** add `client → cache`; assert `questionable_type_pairing`, severity `judgment`.
8. **Sync cycle, two components:** a two-service sync cycle returns one `synchronous_cycle`, severity `judgment`, and the SCC members.
9. **Async cycle allowed:** the same two-service cycle as `async` returns no `synchronous_cycle`.
10. **Mixed cycle allowed:** a three-service graph with `A → B` sync, `B → C` sync, `C → A` async returns no sync cycle; changing `C → A` to sync returns one judgment.
11. **Sync self-loop:** a service with a sync edge to itself returns one `synchronous_cycle`, severity `invalid`.
12. **Async self-loop:** the same edge as `async` returns no sync cycle.
13. **Missing required link, invalid:** remove `cnx_lb_api` (`load_balancer → service`) from the full fixture. The load balancer still has an inbound edge, so it is not isolated; assert exactly one `missing_required_link` on the load balancer, severity `invalid`, and no `disconnected_component`.
14. **Missing required link, judgment:** remove `cnx_api_search` and add `search_index → service`; assert `missing_required_link` on the index, severity `judgment`, plus the questionable pairing.
15. **Isolated suppression:** remove every connection touching the database; assert `disconnected_component` and no `missing_required_link` for that database.
16. **Severity default:** a bare `Issue(kind=..., message=...)` is `invalid`; a `check_references()` issue is `invalid`.
17. **Determinism:** two calls on the same broken draft return equal lists in the same order; two `load_rules()` loads behave identically.
18. **Message bound:** a 120-node sync ring and a 120-isolated-component graph produce only messages of at most 400 characters, with truncation noted.
19. **No wiring:** source scan of `app/eval/evaluate.py`, `app/eval/runner.py`, `app/llm/generate.py`, and `app/llm/scratch_runner.py` finds no `app.validation` or `validate_graph` import; source scan of `app/validation` finds no `app.eval` or `app.llm` import.
20. **Evaluator untouched:** `app/eval/evaluate.py` still has no `networkx` import.
21. **Schema hashes:** both `schema/*.json` artifacts hash to the recorded constants in §5.5.
22. **Performance, clean:** build 120 components and 300 connections (one client, 119 services, a sync DAG plus extra forward edges). Assert `[]`; run 100 times; assert p95 < 500 ms; print median and p95.
23. **Performance, sync ring:** 120 services in a sync ring; run 50 times; assert exactly one `synchronous_cycle` and p95 < 500 ms.
24. **Performance, isolated:** 120 components with no connections; run 50 times; assert 120 `disconnected_component` issues and p95 < 500 ms.

---

## 9. Edge cases and risks

- **Separate subsystems are not always wrong.** Multiple connected groups may be a legitimate design (for example, an admin plane and a public plane). They are a `judgment` issue, not `invalid`. An isolated component in a multi-component graph is `invalid`.
- **A single-component architecture is legal.** The disconnected check must not flag a one-component draft with zero connections. This is pinned by step-1 §9 and by test 4.
- **Dangling edges create phantom connectivity.** Build the graph from connections whose endpoints both exist. A component connected only by dangling edges is isolated; it gets both the dangling issue and the disconnected issue. That is correct.
- **Required links versus invalid pairings.** A required link must never be satisfiable only by an `invalid` pairing. The loader enforces this; without it, the two checks would contradict each other.
- **Required links on isolated components.** They are suppressed because the disconnected check already reports the component. A component connected only by a questionable pairing still gets the missing-link issue.
- **Cycle enumeration can explode.** Use SCCs, not `simple_cycles`. A 120-node sync ring must be linear and must produce one issue, not 120.
- **Cycle severity is split.** A multi-node synchronous cycle is a judgment call: request/response loops exist in real designs. A synchronous self-loop is invalid: it is a single component calling itself with no intervening boundary. Async and mixed cycles are allowed.
- **Over-marking the matrix.** Only pairings wrong in nearly all designs are `invalid`; everything arguable is `judgment`. The eleven cells listed in §6.2 were downgraded in review, and the rest were re-checked.
- **`queue → cache` and `cache_accessor`.** The matrix now treats a queue-to-cache sink as a warning, but `cache_accessor` still accepts only service, worker, api_gateway and cache as accessors. A cache fed only by a queue would therefore still get a missing-link issue. The rule was kept as proposed in review; this interaction is reported for a later decision rather than changed silently.
- **Rules derived from rubrics.** None. The rules come from general practice. The eval set is not read, imported, or parsed by this module or its tests.
- **Accidental wiring.** The validator must not be imported by generation, retry, the harness, the runner, or the evaluator. Source scans pin this.
- **Step-3 networkx rule.** Step 3 forbade `networkx` outside `evaluate.py`. Step 4 intentionally introduces it in `app.validation` only; `app.eval.evaluate` stays free of it.
- **Schema drift.** `Issue` is not part of the architecture schema, so adding a severity field must not change either artifact. The hash test pins both.
- **Data-file drift.** The loader validates the file on every load; the consistency test pins the two rule sets against each other.
- **Severity confusion.** `IssueSeverity.invalid/judgment` is not `Severity.blocking/warning`. A structural error must not look like a contradictory-requirement flag.
- **Message overflow.** `Issue.message` is capped at 400 characters; long SCC or group lists are truncated deterministically.

---

## 10. Decisions (resolved in review)

1. **Severity model — approved.** A new `IssueSeverity` (`invalid`, `judgment`) on the existing `Issue`, defaulting to `invalid`. One soft-issue mechanism, one return type. The flag `Severity` (`blocking`, `warning`) is not reused.
2. **Dangling delegation — approved.** `validate_graph` calls `draft.check_references()` and returns all those issues first, rather than re-implementing endpoint checks. Group, requirement and assumption reference issues are included.
3. **Disconnected semantics — approved.** An isolated component in a multi-component graph is `invalid`; more than one connected group with no isolated node is `judgment`; a single-component architecture is legal.
4. **Cycle semantics — resolved.** A synchronous cycle of two or more components is `judgment`; a synchronous self-loop is `invalid`; async-only and mixed cycles are allowed. SCCs are used instead of enumerating simple cycles so a 120-node ring stays linear.
5. **Type-pairing matrix — resolved.** The matrix in §6.2 applies the “wrong in nearly all real designs” test. The eleven cells listed as changed moved to `judgment`; the remaining invalid cells were re-checked and kept.
6. **Required-link rules — resolved.** Fourteen rules. `queue_consumer` and `service_caller` are `judgment`; `external_service_caller` is `either`; the rest are as proposed. `client_entry` and `search_index_reader` remain omitted for the reasons given.
7. **Isolated suppression — approved.** Missing-link rules skip components with degree 0, so the disconnected check is the single explanation for a fully isolated component.
8. **Data file — approved.** `backend/app/validation/rules.json`, with `pairing_default: "allowed"`, `rules_version: "1.0"`, and only the `I`/`W` cells encoded. The loader validates it and rejects contradictions with the required-link rules.
9. **Model touch — approved, with a schema guard.** `backend/app/model/enums.py` gains `IssueSeverity` and six `IssueKind` values; `backend/app/model/issues.py` gains the defaulted `severity` field; `backend/app/model/__init__.py` exports `IssueSeverity`; `docs/step-1-data-model.md` §6.7 gets a short note. Both schema artifacts must stay byte-identical, proven by the hash test in §5.5.
10. **Dependency — approved.** `networkx` is added to `backend/pyproject.toml` and `app.validation` to the package list. `app/eval/evaluate.py` remains networkx-free.
11. **Performance bar — approved.** p95 < 500 ms on 120 components / 300 connections, 100 iterations, with the actual median and p95 reported. The bar is deliberately loose so the test measures the algorithm, not the machine.
12. **No wiring — approved.** The validators are not imported by generation, retry, the harness, the runner, the evaluator, the report, or the scratch runner. `eval/`, `prompts/system/`, `eval/freeze.json` and `backend/app/eval/` are untouched; `scored_run_approved` stays `false`.

No decisions remain open. This v2 is the build contract.

---

## 11. Report format

Per acceptance criterion in §7: pass or fail with real evidence. Then:

- the full `python -m pytest -v` output;
- the exact `backend/app/validation/rules.json`;
- the schema hash check: both computed SHA-256 values against the recorded constants;
- the §6.2 matrix and §6.3 required-link table as implemented, with every cell changed from v1 listed;
- the two clean-fixture results;
- one broken-variant result per check, showing kind, severity and `element_id`;
- the sync/async cycle table, including the self-loop cases and the multi-node judgment case;
- the 120-component timings: median, p95, iteration count, and issue count for clean, sync-ring and isolated graphs;
- the data-driven proof: the temp-rules run that changes behaviour;
- the source-scan output for no wiring and for `evaluate.py` remaining networkx-free;
- files created or changed;
- any deviation stated plainly.

No model is called. No scored run is made. No result is reported for a model.

---

## 12. Stop condition

I implement only the paths in §5, run the offline tests, report with real evidence, commit and push to `origin/main`.

I do not wire the validators into generation, retry, the harness, the runner, the evaluator, the report or the scratch runner. I do not touch `eval/`, `prompts/system/`, `eval/freeze.json`, `backend/app/eval/`, or `schema/`. I do not set `scored_run_approved`. I do not run any model or provider call. I do not start step 5.

Then I stop and wait for **approved** on step 4. After that approval, I draft `docs/prompts/step-5-layout-render.md` for review, with no code.
