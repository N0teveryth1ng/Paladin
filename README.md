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
- **The AI never decides coordinates.** A deterministic first layout gives users a
  clean starting point; they can then arrange the diagram directly on the canvas.
  Coordinates stay out of the architecture model.
- **Agent runs are atomic.** A run fully lands or rolls back.
- **Validation is mostly deterministic.** Rule checks are code; judgment calls are flagged
  separately as critique.
- **Ask or flag, never guess.** Assumptions are visible; contradictions are flagged.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1 | Data model + JSON Schema export | done |
| 2 | Versioned evaluation sets | done; v1 frozen, v2 scored (failed), v3 frozen as a prompt pair |
| 3 | Generation harness + local API | done; free Nemotron model selected for local generation |
| 4 | Deterministic validators | done |
| 5 | Deterministic first layout + interactive canvas | done |
| 6 | Frontend/API integration | done |
| 7 | Prompt v1.2 + evaluation v2 | done; v2 did not meet the registered pass bar |
| 8 | Prompt v1.3 + evaluation v3 | v3 pair frozen, not scored; v1.3.1 candidate scratch check pending |

## Evaluation versions

`eval/eval_set.json` (v1.0, SHA-256 `280E2E41…C024DC`) remains frozen history
with system prompt v1.1. `eval/eval_set_v2.json` (v2.0, SHA-256 `BD713F…E2770E`)
is the new held-out set paired with the approved v1.2 draft
`prompts/system/architecture-v1.2.md`. Both are chosen with
`--eval-set-version` (default `1.0`); no file is swapped and no threshold
changes. `eval/eval_set_v3.json` is also frozen as a versioned pair with prompt
v1.3, but has not been scored. The v2 run failed one adversarial criterion;
v3 has no result yet. See `eval/README.md` for the protocol and hashes.

The local API currently selects `nemotron-3.5-super-vl`, the zero-priced
OpenRouter free model, in `eval/freeze.json`. Provider credentials stay in the
git-ignored `.env`; generation sends prompts to the configured provider.

## Layout

```
backend/app/model/     Pydantic v2 architecture graph
backend/tests/         model and schema tests, fixtures
schema/                generated JSON Schema artifacts (committed)
docs/                  step plans and decisions
```

## Setup

Project-local virtual environment, no global installs:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

## Usage

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -v                 # run the test suite
.\.venv\Scripts\python.exe -m app.model.export_schema   # regenerate schema/*.json
```

Requires Python 3.11+. All dependencies are declared in `backend/pyproject.toml`;
`.venv/` is git-ignored.

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
