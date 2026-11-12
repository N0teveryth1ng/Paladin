# Paladin

An accurate, non-hallucinating AI architecture engineer for software system design.
Prompt in, validated structured architecture out, deterministic layout, clean diagram.
Built for that one problem and nothing else.

Source of truth: `AI-Native System Design Whiteboard Refined Scope and Core Direction.pdf` (v1.2).

## Core pipeline

```
prompt -> structured architecture -> deterministic validation -> automatic layout -> render
```

Nothing outside this pipeline is in scope until it passes its evaluation.

## Principles

- **Typed model is the foundation.** The AI produces a graph of components, connections,
  groups and properties, never a picture. Validation, editing, diffing and explanation all
  read from it.
- **The AI never decides coordinates.** Position, spacing, routing and overlap are
  deterministic. No geometry or styling exists in the model.
- **Agent runs are atomic.** A run fully lands or rolls back.
- **Validation is mostly deterministic.** Rule checks are code; judgment calls are flagged
  separately as critique.
- **Ask or flag, never guess.** Assumptions are visible; contradictions are flagged.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1 | Data model + JSON Schema export | done |
| 2 | Evaluation set (15 prompts + rubrics) | not started |
| 3 | Headless generation harness | not started |
| 4 | Deterministic validators (networkx) | not started |
| 5 | Layout and render (elkjs + React Flow) | not started |

## Layout

```
backend/app/model/     Pydantic v2 architecture graph
backend/tests/         model and schema tests, fixtures
schema/                generated JSON Schema artifacts (committed)
docs/                  step plans and decisions
```

## Usage

```powershell
cd backend
python -m app.model.export_schema   # regenerate schema/*.json
python -m pytest -v                 # run the test suite
```

Requires Python 3.11+, `pydantic>=2.11`, and for development `pytest` + `jsonschema`.

## The model in one paragraph

`ArchitectureDraft` is exactly what the model emits: title, summary, requirements,
components, connections, groups, assumptions and flags. `Architecture` is the stored
record, which adds `schema_version`, `prompt`, `domain` and `meta`, injected by the
harness after generation. The AI never sees or produces the envelope. Every element
carries `requirement_refs` and a boolean `assumed` flag with a `rationale`: an element is
either traceable to a stated requirement or visibly marked as an assumption. Shape errors
fail hard; meaning errors (dangling references, bad group cardinality) are returned as
structured issues so they can be reported instead of crashing the pipeline.

## Not in scope

Deployment, auth, rate limiting, clustering, collaboration, import/export, cost
estimation, version history, multi-level drill-down, and the full benchmark.
