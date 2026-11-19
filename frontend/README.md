# Paladin frontend — deterministic layout and render

Read-only canvas that turns an `ArchitectureDraft` into a deterministic
`LayoutResult` with elkjs and renders it with React Flow. It never calls a
model, a provider, or the Python validators. Its only network target is the
local generation API at `http://127.0.0.1:8000`, reached solely through
`src/api/client.ts`.

## Requirements

- Node.js 24 (developed on v24.16.0) and npm 10.8.2.
- The repository's backend virtualenv, for the one-way issue exporter and for
  the local generation API (`backend/.venv`).

## Local generation

Generation is served by a **local** FastAPI app bound to `127.0.0.1:8000`.
It refuses to start unless `eval/freeze.json` contains a non-empty
`selected_model`; there is no fallback model, no UI picker and no environment
override. With no selected model, `/api/health` reports
`"model": "no model selected"` with HTTP 503 and the run endpoints return 503.

Start the backend from the repository root with the backend virtualenv:

```bash
cd backend
.venv/Scripts/activate        # Windows PowerShell
python -m app.api             # uvicorn on 127.0.0.1:8000 only
```

The module entry runs the startup guard first. The equivalent raw uvicorn
command, after that guard has passed, is
`uvicorn app.api.main:app --host 127.0.0.1 --port 8000`; never bind another
host.

Then start the frontend in a second terminal. Both Vite servers bind to
`127.0.0.1` explicitly so the browser origin is one of the two CORS-allowed
origins (`http://127.0.0.1:5173` and `http://127.0.0.1:4173`):

```bash
cd frontend
npm run dev        # http://127.0.0.1:5173
# or, after a build:
npm run preview    # http://127.0.0.1:4173
```

Type a prompt into the **Prompt** box and press **Generate**. The canvas locks
for the whole run; a progress line shows elapsed time and the server maximum
(`max 25:00`, derived from the frozen settings). There is no cancel button.
A successful run atomically replaces the diagram, the validator issue artifact
and the layout. A failure, timeout or lost connection leaves the previous
diagram untouched and shows an error card. On HTTP 429 no retry is made and the
message names the 00:00 UTC daily reset. Blocking flags are delivered with the
diagram and stay visible in the “Unresolved blocking flag” panel above the
canvas.

## Install

```bash
cd frontend
npm ci
```

`package-lock.json` is committed. Every direct dependency is pinned to an exact
version; `.npmrc` sets `legacy-peer-deps=true` so `npm ci` works with npm 10.

## Test

```bash
npm test          # vitest run: layout, render, drift, dependencies, theme
npx tsc --noEmit  # type check
```

## Build

```bash
npm run build     # tsc --noEmit && vite build -> dist/
```

## Screenshots

```bash
npm run screenshots
```

This regenerates the issue artifacts with the backend exporter, builds the app,
starts `vite preview` on `127.0.0.1:4173`, and writes nine 1600 × 1000 PNGs to
`../docs/screenshots/step-5/`:

| file | fixture | theme | view |
|---|---|---|---|
| `small-light.png` | small | light | fit-to-view |
| `full-light.png` | full | light | fit-to-view |
| `large-light.png` | large | light | fit-to-view |
| `large-light-zoom.png` | large | light | `?focus=cmp_000&zoom=1` |
| `broken-issues-light.png` | broken | light | issues + adjustments panels |
| `locked-light.png` | small | light | `?locked=1` |
| `small-dark.png` | small | dark | fit-to-view |
| `full-dark.png` | full | dark | fit-to-view |
| `large-dark.png` | large | dark | fit-to-view |

Playwright's Chromium must be installed once:

```bash
npx playwright install chromium
```

Step 6 adds five 1600 × 1000 screenshots in `../docs/screenshots/step-6/`:
`prompt-idle.png`, `run-running.png`, `run-success-issues.png`,
`run-blocking-flag.png` and `run-error-429.png`. They are captured by
`e2e/step6-screenshots.spec.ts` against a separately-running fake-injected
backend on `127.0.0.1:8000`; the browser never stubs `fetch`. That launcher is a
test-only backend fixture and is not part of the runtime app:

```bash
npx playwright test e2e/step6-screenshots.spec.ts
```

## URL parameters

| parameter | values | default |
|---|---|---|
| `fixture` | `small`, `full`, `large`, `broken` | `small` |
| `theme` | `light`, `dark` | `prefers-color-scheme` |
| `locked` | `1` | unlocked |
| `focus` | a component or group id | fit-to-view |
| `zoom` | `0 < zoom <= 4`, used with `focus` | fit-to-view |

Unknown values fall back to the default. The toolbar also switches fixture and
theme without editing the URL. After a successful live run the picker shows
“Live run”; choosing a fixture discards the live entry in memory only.

## Layout

`src/layout/layout.ts` exports `layoutArchitecture(draft)`, a pure async
function. It normalises soft-rule violations deterministically, builds one ELK
layered graph, and returns the only object that carries coordinates:

- components are fixed at 220 × 88, so layout never measures the DOM;
- components, connections and groups are sorted by id before layout;
- the frozen ELK options live in `src/layout/elkOptions.ts` and are not tuned;
- every dropped or adjusted item becomes a `LayoutAdjustment` shown in the
  side panel's “Layout adjustments” section;
- group children are converted from group-relative to absolute coordinates once,
  in `layout.ts`.

Determinism is proven twice by `src/test/layout.test.ts`: two calls are
deep-equal, and two separate Node processes produce the same SHA-256 through
`scripts/layout-hash.mjs`:

```bash
node --import tsx scripts/layout-hash.mjs small_architecture
```

## Fixtures and generated artifacts

- `src/fixtures/small_architecture.json` and
  `full_coverage_architecture.json` are byte-identical to the backend fixtures.
- `src/fixtures/large_architecture.json` is generated by
  `scripts/generate-large-fixture.mjs` (120 components, 300 connections,
  6 groups) and regenerates byte-for-byte.
- `src/fixtures/broken_architecture.json` is schema-valid and carries every
  malformed soft-rule case. It is never normalised on disk; normalisation
  happens in memory and is listed in the side panel.
- `src/fixtures/issues/*.issues.json` are generated one-way by
  `scripts/export-fixture-issues.py` through `scripts/export-issues.mjs`. They
  are display-only and are never fed back into generation. `npm run
  export:issues` regenerates all four.
- `src/types/architecture.generated.ts` is generated from the frozen schema by
  `scripts/generate-types.mjs` (`npm run generate:types`). Its banner carries
  the schema SHA-256. Do not edit it by hand.

## Canvas states

- **View-only (default):** pan and zoom work; nodes cannot be dragged or
  connected; elements are selectable for inspection.
- **Locked (`?locked=1`):** pan, zoom, selection, keyboard focus and dragging
  are disabled after the initial fit; the toolbar shows “Locked while the agent
  runs”. The theme toggle remains available.

## Dependency policy

- Exact versions only; no ranges, tags, git URLs or file paths.
- `npm ci` is the documented install.
- `npm run check:deps` prints every direct dependency with its publish date and
  fails if a selected version is newer than 14 days.
- `npm audit` findings are reported, never auto-fixed.

## Source boundaries

The runtime under `src/**` (excluding `src/test/**` and `src/fixtures/**`) is
scanned by `src/test/dependencies.test.ts`. Network calls and the loopback
address are allowed only in `src/api/client.ts`, and only to the single
configured origin `http://127.0.0.1:8000`. Every other prohibition is retained
everywhere: no `validate_graph`, `app.validation`, `child_process`, provider or
model SDK, key name, `openrouter`, or non-loopback host. Only
`src/test/layout.test.ts` uses `child_process`, for the required two-process
determinism proof.
