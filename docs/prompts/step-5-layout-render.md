# Step 5 — Deterministic Layout and Render

**Step prompt · v1 draft · 19 November 2026 · for review; no build yet**
**Source of truth:** project document v1.2 §4.5, §6.8, §8.9; `README.md` “Principles”; `docs/step-1-data-model.md` §2, §6.7 and §9; `docs/prompts/step-4-validators.md` §5.1 and §6.5.

> This is a draft for review. No code is written, no dependency is installed, no model or provider is called, and no scored run is made. §10 lists four decisions that must be answered before the build starts.

---

## 1. Goal

Render an `ArchitectureDraft` as a clean, deterministic architecture diagram in a local React application.

The draft is loaded from committed fixtures. A pure layout function turns the graph into coordinates with `elkjs`; React Flow draws the result. The architecture model never contains a coordinate, a size, or a style. The same input must always produce the same diagram.

This step proves the render half of the pipeline:

```
ArchitectureDraft (fixture) -> deterministic layout (elkjs) -> React Flow canvas
```

It does **not** call a model, does not connect to generation, retry, or the harness, and does not write anything back into an architecture.

---

## 2. In scope

- A local frontend under `frontend/`: React + TypeScript + React Flow + elkjs, bundled with Vite.
- TypeScript architecture types generated from `schema/architecture.generation.schema.json` by a committed script, never hand-written, with a drift test.
- A deterministic, headless-testable `layoutArchitecture(draft)` function using elkjs layered layout, left to right, groups as containers with one nesting level, and edge-label space reserved.
- A read-only React Flow canvas with pan and zoom.
- A distinct, consistent node style for each of the 14 component types.
- Sync and async edges visually distinct, with a legend.
- Component technology shown on the node; assumed elements visibly marked.
- A side panel showing requirements, assumptions, flags, and the legend.
- A read-only validator-issues panel fed by committed `validate_graph` output artifacts.
- A locked canvas state that disables pan, zoom, selection, and dragging, for the later agent-running phase.
- Headless screenshots of both fixtures and the 120-component / 300-connection graph, committed under `docs/screenshots/step-5/`.
- Unit, component, determinism, performance, and end-to-end tests.

## 3. Out of scope

- Any generation call, model call, provider call, retry, harness, or scored run. `scored_run_approved` stays `false`.
- Wiring the frontend to the backend, to `app.llm`, to `app.eval`, or to the validators at runtime.
- Editing the architecture, adding or deleting elements, or mutating the draft.
- Export (PNG, SVG, PDF, JSON), persistence, local storage, a database, auth, users, or collaboration.
- Saving dragged positions or position overrides. The layout stays pure and deterministic in this step.
- Any change to `eval/`, `prompts/system/`, `eval/freeze.json`, `backend/app/eval/`, `backend/app/llm/`, `backend/app/validation/`, `backend/app/model/`, or `schema/`.
- New component types, connection types, architecture fields, or schema changes.
- A design system, a component library, animation, or a mobile layout.
- Deployment, a server, SSR, routing beyond a single page, or a cloud screenshot service.

---

## 4. Inputs from earlier steps

- `schema/architecture.generation.schema.json` — frozen `ArchitectureDraft` schema, SHA-256 `0033E0C195B72B0E822CD4DCA8A4C3EB418AEB22765A66F04E90448A760FC89F`. This is the only source of the architecture types.
- `schema/architecture.stored.schema.json` — frozen stored schema, SHA-256 `1E9C1EE76533E1437EE7B402BE18090A82CDB4448B15E0D7CD036579981DA995`. Not used by the frontend; listed to confirm it is untouched.
- `backend/tests/fixtures/small_architecture.json` — 5 components, clean, no validator issues.
- `backend/tests/fixtures/full_coverage_architecture.json` — full type coverage, one async cycle, clean, no validator issues.
- `backend/app/model/enums.py` — `ComponentType` (14 values), `ConnectionType` (`sync`, `async`), `IssueSeverity` (`invalid`, `judgment`).
- `backend/app/model/issues.py` — `Issue` fields used by the read-only panel: `kind`, `severity`, `element_id`, `message`.
- `backend/app/validation/` — `validate_graph` and `load_rules`; imported only by the one-way issue exporter, never by the frontend runtime.
- `backend/app/validation/rules.json` — `rules_version "1.1"`, used only to stamp the issue artifacts.
- `docs/step-1-data-model.md` §2 — no geometry or styling in the model; §6.7 — validator ownership; §9 — a single-component architecture is legal.
- `docs/prompts/step-4-validators.md` §6.5 — the issue kinds and severities the panel may display.
- Project document v1.2 §4.5 — deterministic layout; §6.8 — rendering rules; §8.9 — the 120-component stress case.
- `README.md` — “The AI never decides coordinates. Position, spacing, routing and overlap are deterministic.”

---

## 5. Deliverables (exact paths)

```
D:\Paladin\
  frontend\
    .gitignore                       # node_modules, dist, test-results, playwright-report, .vite
    package.json                     # pinned dependencies and scripts
    package-lock.json                # committed lockfile
    tsconfig.json
    tsconfig.node.json
    vite.config.ts
    vitest.config.ts
    playwright.config.ts
    index.html
    scripts\
      generate-types.mjs             # schema -> src/types/architecture.generated.ts
      generate-large-fixture.mjs     # deterministic 120/300 fixture
      export-fixture-issues.py       # validate_graph -> committed issue JSON (dev only)
      export-issues.mjs              # picks the backend venv and runs the exporter
      layout-hash.mjs                # prints the SHA-256 of a layout for cross-process determinism
    src\
      main.tsx
      App.tsx
      app\
        modes.ts                     # query-parameter parsing: fixture, theme, locked, labels
      types\
        architecture.generated.ts    # generated; never edited by hand
        schema.ts                    # committed SCHEMA_SHA256 constant
        issues.ts                    # small display type for Issue (not part of the architecture schema)
      fixtures\
        small_architecture.json      # byte-identical copy of the backend fixture
        full_coverage_architecture.json
        broken_architecture.json     # frontend-only fixture that produces issues
        large_architecture.json      # generated 120 components / 300 connections
        issues\
          small_architecture.issues.json
          full_coverage_architecture.issues.json
          broken_architecture.issues.json
          large_architecture.issues.json
      layout\
        layoutTypes.ts               # LayoutResult and friends; the only place coordinates exist
        nodeSizes.ts                 # pure, fixed node and group sizing
        elkOptions.ts                # the frozen elkjs option object
        layout.ts                    # layoutArchitecture(draft)
      render\
        Canvas.tsx                   # React Flow wrapper; read-only and locked modes
        nodes\ComponentNode.tsx
        nodes\GroupNode.tsx
        edges\ArchitectureEdge.tsx
        Legend.tsx
        SidePanel.tsx
        IssuesPanel.tsx
        Toolbar.tsx
        theme.ts                     # per-type color tokens and theme tokens
        styles.css
      test\
        types-drift.test.ts
        fixtures.test.ts
        layout.test.ts
        layout-performance.test.ts
        render.test.tsx
        locked.test.tsx
        issues-panel.test.tsx
        theme.test.ts
    e2e\
      screenshots.spec.ts
  docs\screenshots\step-5\
    small-light.png
    full-light.png
    large-light.png
    broken-issues-light.png
    locked-light.png
    small-dark.png
    full-dark.png
    large-dark.png
```

No other file changes. In particular, no file under `backend/`, `eval/`, `prompts/system/`, or `schema/` is modified. The exporter reads `backend/` and writes only into `frontend/src/fixtures/issues/`.

### 5.1 Frontend app

A single-page Vite application. It has no server, no router, no API client, and no environment secrets. The only runtime data is the committed JSON imported statically.

### 5.2 Generated types

`src/types/architecture.generated.ts` is produced by `scripts/generate-types.mjs` from the generation schema. It is committed so the app builds without running the generator. The file starts with a fixed banner:

```
/* eslint-disable */
/* Generated by scripts/generate-types.mjs. Do not edit. */
/* source: schema/architecture.generation.schema.json */
/* sha256: <uppercase SHA-256 of the schema bytes> */
```

`src/types/schema.ts` holds the same hash as `SCHEMA_SHA256`. No architecture interface is written by hand anywhere in `src/`.

### 5.3 Fixtures and issue artifacts

- The two backend fixtures are copied byte-for-byte into `src/fixtures/`. A test hashes both copies against the originals, so they cannot drift silently.
- `broken_architecture.json` is a frontend-only variant of the small fixture. It adds one isolated service, one `database -> client` connection (`invalid`), and one `client -> cache` connection (`judgment`), so the panel has both severities plus a `disconnected_component` issue.
- `large_architecture.json` is generated by `scripts/generate-large-fixture.mjs` with a fixed seed. It has exactly 120 components, 300 connections, 6 groups, all 14 component types, both connection types, and schema-valid ids. It is a stress fixture, not a validity fixture; its validator output is whatever the rules produce.
- Each `*.issues.json` is a one-way artifact from `validate_graph`:

```json
{
  "fixture": "small_architecture.json",
  "rules_version": "1.1",
  "issues": [
    {
      "kind": "invalid_type_pairing",
      "severity": "invalid",
      "element_id": "cnx_db_legacy_client",
      "message": "..."
    }
  ]
}
```

The exporter lives in `frontend/scripts/`, runs under the backend virtual environment, and is not part of the app bundle. The frontend never imports Python, never calls the backend, and never runs the validators.

### 5.4 Layout module

`layoutArchitecture(draft: ArchitectureDraft): Promise<LayoutResult>` is pure with respect to the draft: it does not mutate the input and does not read the DOM. `LayoutResult` is the only type that contains `x`, `y`, `width`, and `height`.

### 5.5 Render components

React Flow (`@xyflow/react`) renders `LayoutResult`. Node and edge components are display-only. No node or edge component writes to the draft or to layout state.

### 5.6 Screenshots

Committed PNGs under `docs/screenshots/step-5/`. They are produced by Playwright from the built app with a fixed viewport, fixed theme, and animations disabled.

---

## 6. Proposed design

### 6.1 Stack and app shell

- React + TypeScript, bundled by Vite (subject to decision 1).
- `@xyflow/react` for the canvas; `elkjs` for layout.
- `vitest` + `@testing-library/react` for unit and component tests; `@playwright/test` for screenshots.
- One page. A top toolbar shows the fixture name, theme toggle, edge-label toggle, fit button, and a lock indicator. The canvas fills the viewport; the side panel is a fixed-width column on the right.
- URL parameters make every screenshot deterministic:
  - `?fixture=small|full|large|broken`
  - `?theme=light|dark`
  - `?locked=1`
  - `?labels=all|none` (default `all`)
- With no parameters, the app opens the small fixture, follows `prefers-color-scheme`, is unlocked, and shows labels.
- The canvas container exposes `data-layout-ready="true"` after the first React Flow render, plus `data-fixture`, `data-theme`, and `data-locked`. Tests and screenshots wait on those attributes instead of sleeping.

### 6.2 Type generation and drift guard

`scripts/generate-types.mjs`:

1. reads `schema/architecture.generation.schema.json` as bytes;
2. computes SHA-256;
3. calls `json-schema-to-typescript` with a pinned version and fixed options (`bannerComment` built from the four header lines, `additionalProperties: false`, `format: false`, no timestamps);
4. writes `src/types/architecture.generated.ts` with LF endings and a trailing newline.

The generator is deterministic: running it twice produces identical bytes.

`types-drift.test.ts` fails when:

- the schema hash differs from `SCHEMA_SHA256`;
- the committed generated file differs from a fresh in-memory generation;
- the banner hash differs from `SCHEMA_SHA256`.

A negative proof runs the generator against a temporary copy of the schema with one extra property and asserts that both the hash and the generated content change. The real schema is never modified.

`issues.ts` is the one hand-written display type, because `Issue` is not part of the architecture schema. It contains only `kind`, `severity`, `element_id`, and `message`. A test asserts every artifact issue has exactly those fields. The “never hand-written” rule applies to the architecture types.

### 6.3 Fixture loading and query modes

`app/modes.ts` parses and validates the query parameters, falling back to the defaults on an unknown value. The selected fixture and its issue artifact are imported statically through a small registry, so Vite bundles only committed JSON and the app never fetches at runtime.

A missing or malformed fixture renders an error card, not a crash. The three non-default fixtures are reachable from the toolbar, so the app can be reviewed without editing the URL.

### 6.4 Deterministic layout

`layoutArchitecture` builds an ELK graph from the draft:

- Sort components, connections, and groups by `id` before building the graph. Input array order must not affect the result.
- One ELK node per component. Fixed size from `nodeSizes.ts`: **220 × 88** for every component. Fixed sizes are required for headless determinism; content measurement in the DOM is not allowed.
- One ELK node per group, as a container. Groups may contain components only. The schema allows at most one nesting level; a component belongs to at most one group.
- Components outside a group are top-level nodes.
- One ELK edge per connection whose `from` and `to` both exist. Edges with an unknown endpoint are skipped by the layout and counted in the side panel; they must not crash the app.
- Edge labels are passed to ELK so it reserves space for them.
- Frozen options in `elkOptions.ts`:

```
algorithm: "layered"
elk.direction: "RIGHT"
elk.edgeRouting: "ORTHOGONAL"
elk.hierarchyHandling: "INCLUDE_CHILDREN"
elk.layered.considerModelOrder.strategy: "NODES_AND_EDGES"
elk.layered.nodePlacement.strategy: "BRANDES_KOEPF"
elk.layered.cycleBreaking.strategy: "GREEDY"
elk.spacing.nodeNode: "40"
elk.layered.spacing.nodeNodeBetweenLayers: "80"
elk.spacing.edgeNode: "24"
elk.spacing.edgeEdge: "12"
elk.spacing.labelNode: "8"
elk.spacing.labelEdge: "8"
elk.padding: "[top=28,left=28,bottom=28,right=28]"
```

These options are a pre-registered constant. They may not be tuned per fixture or to make a screenshot look better. The same padding block is set on every group node.

The result normalises coordinates for React Flow:

- group position is absolute;
- child position is relative to its group, and group nodes are ordered before their children in the nodes array;
- every component, group, and edge label has `x`, `y`, `width`, `height`;
- the result also carries the overall canvas width and height.

`LayoutResult` is the only place coordinates exist. The generated architecture types contain no `x`, `y`, `position`, `width`, or `height` field. A test scans the fixture JSON for those keys at model level; `attributes` values are strings and are never interpreted as geometry.

Determinism is proven twice: two calls in one process are deep-equal, and two separate Node processes running `scripts/layout-hash.mjs` through `tsx` print the same SHA-256 for the same fixture.

### 6.5 Node visual language

One node component, driven by a per-type token table in `theme.ts`. Each of the 14 types gets:

- a unique accent color used for the left color band and the type badge;
- a unique two-letter glyph (`CL`, `GW`, `LB`, `SV`, `WK`, `DB`, `CA`, `MQ`, `OS`, `CD`, `AU`, `SX`, `SC`, `EX`);
- the same shape and layout, so the diagram reads as one system.

Node content, top to bottom:

1. name (bold, up to two wrapped lines);
2. type label (small caps);
3. technology (monospace, one line, ellipsis when long).

Assumed components get a dashed outer border and an `assumed` pill in the top-right corner. A component referenced by a validator issue gets a small severity dot in the bottom-right corner; the dot reads from the issue artifact and is display-only.

Group nodes are rounded containers with a header bar showing the group name and an `assumed` pill when applicable. Members are clipped to the group and never drawn outside it.

### 6.6 Edges, legend, labels

- Sync edges: solid stroke, filled arrowhead.
- Async edges: dashed stroke (6/4), open arrowhead.
- Both use the same neutral edge color so the dash pattern, not color alone, carries the meaning.
- Every edge label shows the connection `label` (truncated to 28 characters, full text in the side panel). Technology is shown in the side panel when the edge is selected.
- An assumed connection gets an `A` badge on its label.
- An edge referenced by a validator issue gets the same severity dot as a node.
- A legend is always visible in the side panel: sync (solid), async (dashed), assumed (dashed border + pill), issue severity (`invalid`, `judgment`), plus the 14 type colors and glyphs.

Decision 3 controls whether edge technology is always shown on the canvas or only in the side panel.

### 6.7 Side panel

A read-only column with collapsible sections and live counts:

- **Overview** — title, summary, counts (components, connections, groups, requirements).
- **Requirements** — id, kind, source, text.
- **Assumptions** — id, scope, text, rationale, element refs.
- **Flags** — severity (`blocking` / `warning`), kind, description, requirement refs.
- **Legend** — as in §6.6.

Clicking a component, group, or connection in the unlocked canvas highlights it and opens its details: id, type, technology, description, requirement refs, assumed/rationale, and the issues that name it. This is selection for inspection, not editing.

### 6.8 Validator issues panel

A separate read-only tab or section fed only by the committed `*.issues.json` artifacts.

- Header: fixture name, `rules_version`, total count, and counts by severity.
- One row per issue: severity badge (`invalid` / `judgment`), kind, element id, message.
- The clean fixtures show an explicit “No issues” empty state.
- The broken fixture shows a non-empty list with at least one `invalid` and one `judgment` row.
- No controls mutate the graph. No “fix”, “apply”, “dismiss”, or “regenerate” action exists.
- The issues are never fed back into generation, retry, the harness, or any model prompt. The runtime has no code path from this panel to the draft.

### 6.9 Canvas states

**View-only (default).** Pan and zoom are enabled. `nodesDraggable={false}`, `nodesConnectable={false}`, `edgesReconnectable={false}`, `elementsSelectable={true}`. No edit handles, no add/delete controls.

**Locked (`?locked=1`).** For the later agent-running phase. Pan, zoom, selection, keyboard focus, and dragging are all disabled. The toolbar shows a lock badge and a one-line “Locked while the agent runs” note. The theme toggle remains available because it is not a canvas interaction. The initial fit-to-view still runs once; after that the viewport cannot change. No editing is possible in either state.

The locked state is a prop on `Canvas`, not a separate app, so the later phase can switch it without a rewrite.

### 6.10 Themes

Light and dark themes use CSS variables and a `data-theme` attribute on the root element. Default follows `prefers-color-scheme`; the toolbar toggles it; the query parameter forces it for screenshots. Every type token has a light and a dark value. Node text and background token pairs must reach at least 4.5:1 contrast in both themes; `theme.test.ts` computes this for the token table.

### 6.11 Headless screenshots

**Proposed tool: Playwright** (`@playwright/test`, Chromium only).

Why Playwright:

- it drives the real app in a real browser, so the screenshot proves the actual React Flow render, not a mock;
- its test runner has a built-in `webServer` hook for `vite preview`, auto-waiting, and a screenshot API;
- a fixed viewport, forced color scheme, `reducedMotion: "reduce"`, and `animations: "disabled"` make the images repeatable on this machine;
- it runs fully headless and local, with no cloud account and no upload;
- it is TypeScript-native, matching the frontend.

Puppeteer was the alternative; it is lower-level and would need custom server and readiness glue. Storybook + a cloud visual service was rejected because it is remote and out of scope.

`npm run screenshots` builds the app, starts `vite preview`, and captures:

| file | fixture | theme | extra |
|---|---|---|---|
| `small-light.png` | small | light | default view |
| `full-light.png` | full | light | default view |
| `large-light.png` | large | light | fit-to-view, 120/300 |
| `broken-issues-light.png` | broken | light | issues panel open |
| `locked-light.png` | small | light | `?locked=1` |
| `small-dark.png` | small | dark | default view |
| `full-dark.png` | full | dark | default view |
| `large-dark.png` | large | dark | fit-to-view, 120/300 |

Viewport 1600 × 1000, device scale factor 1. Each capture waits for `[data-layout-ready="true"]` and `document.fonts.ready`, asserts there are no console errors, and then screenshots. The large-graph capture also asserts 120 rendered component nodes and 300 rendered edges before the shot.

If decision 4 is light-only, the three dark files are omitted. The committed list must match the approved decision.

### 6.12 Accessibility and resilience

- Every node has an accessible name: component name, type, and technology.
- The legend and panels use real text, not color alone.
- Keyboard focus is visible in the unlocked state; the locked state removes canvas focus.
- A malformed fixture, a missing issue artifact, or an edge with an unknown endpoint renders an error or a skipped edge, never a blank crash.
- A React error boundary wraps the canvas and shows the error text, so a layout failure is visible and reportable.

---

## 7. Measurable acceptance criteria

1. `frontend/` exists with `package.json`, a committed `package-lock.json`, and a Vite React + TypeScript build. `npm ci` then `npm run build` exits 0.
2. `src/types/architecture.generated.ts` exists, is generated by the committed script, and carries the schema SHA-256 in its banner. No architecture interface is hand-written in `src/`.
3. The drift test fails when the schema hash changes and when the committed generated file differs from a fresh generation; a negative proof with a temporary schema copy demonstrates both.
4. `small_architecture.json` and `full_coverage_architecture.json` under `src/fixtures/` are byte-identical to the backend fixtures, proven by SHA-256.
5. `large_architecture.json` is reproduced byte-for-byte by `scripts/generate-large-fixture.mjs` and contains exactly 120 components, 300 connections, 6 groups, all 14 component types, and both connection types.
6. `layoutArchitecture` is a pure function: it does not mutate the input, and two calls on the same fixture return deep-equal `LayoutResult`s.
7. Two separate Node processes produce the same SHA-256 for the same fixture's layout.
8. No two node rectangles overlap, excluding ancestor/descendant pairs (a group and its own members). Groups do not overlap each other or top-level nodes.
9. Every edge in `LayoutResult` refers to an existing source and target component; every input connection with two known endpoints appears exactly once. An edge with an unknown endpoint is skipped and counted, not rendered and not fatal.
10. Every group member rectangle lies fully inside its group rectangle, with the declared padding. No component belongs to more than one group, and no group is nested inside another.
11. The 120-component / 300-connection layout completes with p95 < 2000 ms over 5 runs and a worst run < 5000 ms, measured in Node on this machine.
12. A headless Chromium page renders the 120-component / 300-connection fixture with 120 component nodes and 300 edges, no console error, and no crash.
13. Each of the 14 component types has a distinct accent color and a distinct two-letter glyph. A test asserts 14 unique colors and 14 unique glyphs, and that every type is covered.
14. Sync and async edges are visually different by stroke pattern and arrowhead; the legend names both; a test asserts the difference and the legend text.
15. Component technology is shown on the node when present. Assumed components, groups, and connections are visibly marked. The side panel lists every assumption and flag in the fixture, with counts that match.
16. The read-only issues panel renders the committed `validate_graph` artifacts: zero for both clean fixtures, non-zero for the broken fixture. It has no control that mutates the draft, and no runtime import of the validators.
17. The default canvas is view-only: nodes cannot be dragged or connected, and pan and zoom work.
18. The locked canvas disables pan, zoom, selection, and focus, and shows a lock indicator.
19. The approved screenshots in §6.11 (eight under decision 4A, five under 4B) exist under `docs/screenshots/step-5/`, each 1600 × 1000, and `npm run screenshots` exits 0.
20. Light and dark token pairs meet at least 4.5:1 contrast for node text; `theme.test.ts` proves it for both themes.
21. A source scan of `src/**/*.{ts,tsx}` (excluding committed fixtures) finds no `fetch(`, `XMLHttpRequest`, `axios`, model-provider client, `localhost`, `127.0.0.1`, `validate_graph`, `app.validation`, or `child_process`.
22. `package.json` contains no HTTP client, model SDK, backend client, or state-persistence dependency.
23. No file under `backend/`, `eval/`, `prompts/system/`, or `schema/` is modified. `eval/freeze.json` still has `scored_run_approved: false`.
24. The backend suite still passes with 307 tests.
25. The changes are committed and pushed to `origin/main`.

---

## 8. Tests

### 8.1 Unit (Vitest)

`types-drift.test.ts`

1. Schema SHA-256 equals `SCHEMA_SHA256`.
2. Fresh generation equals the committed generated file, byte for byte.
3. The banner hash equals `SCHEMA_SHA256`.
4. Negative: a temporary schema copy with one extra property produces a different hash and different generated content.
5. No hand-written architecture interface exists in `src/` (source scan).

`fixtures.test.ts`

1. Both copied fixtures hash to the backend originals.
2. The large fixture regenerates byte-for-byte; counts are 120 / 300 / 6; all 14 types and both connection types are present.
3. The broken fixture parses and has the expected issue-producing elements, and its artifact contains both severities.
4. No fixture contains a model-level `x`, `y`, `position`, `width`, or `height` key.
5. Every issue artifact has `fixture`, `rules_version`, and `issues`, and each issue has exactly `kind`, `severity`, `element_id`, `message`.

`layout.test.ts`

1. Same fixture, two calls: deep-equal results.
2. Two child processes: identical SHA-256 for the same fixture.
3. No overlapping node rectangles, excluding ancestor/descendant pairs.
4. Every edge endpoint exists; every connection with two known endpoints appears once.
5. Every group member is inside its group; groups do not overlap; one nesting level.
6. A dangling edge is skipped and counted without throwing.
7. The layout output is the only object with coordinates: a recursive scan of the draft and of `LayoutResult` proves the draft has none and the result has them.

`layout-performance.test.ts`

1. Large fixture: 5 runs, p95 < 2000 ms, worst < 5000 ms; print all five timings.
2. Small and full fixtures: layout under 1000 ms each; print timings.

`theme.test.ts`

1. 14 unique accent colors and 14 unique glyphs; every `ComponentType` covered.
2. Node text/background contrast is at least 4.5:1 in light and dark.

### 8.2 Component (Vitest + React Testing Library)

`render.test.tsx`

1. Small fixture renders 5 component nodes, its connections, and its groups.
2. Full fixture renders every component and connection; sync and async edges carry different classes.
3. Technology text appears on nodes that declare it.
4. Assumed components, groups, and connections carry the assumed marker.
5. The side panel counts for requirements, assumptions, and flags match the fixture.
6. The issues panel shows “No issues” for both clean fixtures.

`issues-panel.test.tsx`

1. The broken fixture artifact renders a non-empty list with both `invalid` and `judgment` severity badges.
2. No button or control mutates the draft; the rendered panel has no `onClick` that changes graph state.
3. The panel text matches the artifact messages.

`locked.test.tsx`

1. Default: pan and zoom are enabled; nodes are not draggable; nodes are not connectable.
2. Locked: pan, zoom, selection, and focus are disabled; the lock indicator is visible.
3. Locked still renders the same node and edge counts.

`layout.test.ts` also covers the 120/300 graph in the component test through a mount with 120 nodes and 300 edges, asserting no throw.

### 8.3 End-to-end and screenshots (Playwright)

`screenshots.spec.ts`

1. For each approved file in §6.11: load the URL, wait for layout ready and fonts, assert no console errors, assert the expected node/edge counts, screenshot to the exact path.
2. Large fixture: assert 120 component nodes and 300 edges before capture.
3. Locked: assert the lock indicator and that the viewport does not change after a drag attempt.
4. Broken: open the issues panel and assert a non-zero issue count before capture.

### 8.4 Negative and drift proofs

- The type drift test runs the generator against a temporary schema copy, not the frozen file.
- The fixture drift test compares hashes; it does not rewrite the backend fixtures.
- The no-network test scans source text; it does not need a running server.
- The dangling-edge test builds an in-memory draft copy; the committed fixtures are unchanged.
- The lock test attempts a drag and asserts the viewport transform is unchanged.

---

## 9. Edge cases and risks

- **ELK workers versus bundling.** Use `elkjs/lib/elk.bundled.js` so layout runs in Node tests and in the browser without a worker-file path problem. A worker-based setup would make headless tests and the Vite build fragile.
- **DOM measurement breaks determinism.** Node sizes are fixed constants. No `ResizeObserver`, no text measurement, no font-dependent sizing. Text that does not fit is clipped with a tooltip; the box never changes.
- **Input order changes layout.** Sort components, connections, and groups by id before building the ELK graph, and set `considerModelOrder` so ELK preserves that order.
- **ELK nondeterminism across processes.** The cross-process hash test is the guard. If it ever differs, the layout is not shippable; the fix is options and ordering, never a looser test.
- **Group coordinate systems.** ELK child coordinates are relative to the parent; React Flow child positions are relative to the parent group. The adapter must convert once, in one place, and the containment test checks the result in absolute coordinates.
- **Group overlap with top-level nodes.** Groups are ELK parents, so ELK should separate them. The overlap test excludes only ancestor/descendant pairs; a group overlapping an unrelated top-level node is a failure.
- **Edge labels collide.** ELK reserves label space; the test checks node overlap, and the screenshot review checks label legibility. Labels are truncated, never reflowed into a second line.
- **A very wide large graph.** Left-to-right layout of 120 nodes and 300 edges produces a wide canvas. Fit-to-view makes nodes small in the screenshot. That is acceptable for the stress shot; the requirement is no crash and a complete graph, not legibility at 100% zoom.
- **Issue artifacts can go stale.** `npm run screenshots` runs the exporter first. The report records the exact exporter command and the artifact counts. A stale artifact is visible as a count mismatch in the report.
- **The exporter is Python in a frontend folder.** It is a dev-only, one-way artifact generator. It is not imported by `src/`, not bundled, and not shipped. The runtime has no Python or backend dependency.
- **Hand-written `Issue` type.** `Issue` is not in the architecture schema, so it cannot be generated from the frozen artifact. The display type is four fields, pinned by a test against the artifacts.
- **Playwright screenshots are machine-dependent.** Font rasterisation differs across operating systems. The committed images are from this machine, at a fixed viewport and scale. They are review evidence, not a pixel-perfect CI oracle.
- **Read-only drift.** A future edit feature could be tempted to write back into the draft. This step has no mutation path; the lock and read-only tests pin it.
- **Scope creep.** No export, persistence, auth, routing, or model calls. A request for any of these is a later step, not a quiet addition here.

---

## 10. Decisions for you

### Decision 1 — Bundler

- **A. Vite (recommended).** A static SPA, instant dev server, one `vite build`, native Vitest and Playwright integration. No server or SSR is needed for a local whiteboard.
- B. Next.js. Adds a server runtime, routing, and build complexity that this step does not use.
- C. Create React App or a hand-rolled bundler. Slower and less maintained than Vite.

**Recommendation: A.**

### Decision 2 — Interaction model

- **A. View-only now (recommended).** Pan and zoom only; nodes are not draggable. `LayoutResult` stays pure, and a future `positionOverrides` map can be merged in a view-model layer without changing the layout algorithm.
- B. Draggable now with saved position overrides in local storage. Adds persistence, a reset action, and a second source of truth for coordinates, which this step explicitly excludes.
- C. Draggable now, overrides in memory only. Adds interaction without a way to keep it, and complicates the determinism story.

**Recommendation: A.** The locked state is built either way, for the later agent-running phase.

### Decision 3 — Edge label density

- **A. Label always; technology in the side panel (recommended).** The connection label is the primary reading; technology is one click away and does not clutter a 300-edge graph.
- B. Label and technology always on the edge. More information, but visibly noisy on the large fixture.
- C. Labels only on hover or selection. Cleanest canvas, but the diagram no longer explains itself in a screenshot.

**Recommendation: A.** Component technology is always on the node in all three options.

### Decision 4 — Theme

- **A. Light and dark, with a toggle and a query parameter (recommended).** Both are committed as screenshots; the query parameter keeps captures deterministic.
- B. Light only. Fewer files and tokens; dark is deferred.
- C. Dark only. Same trade-off in the other direction.

**Recommendation: A.**

No other decision is open. Node sizing is fixed at 220 × 88 by design, because content measurement would make the layout non-deterministic. The elkjs option block in §6.4 is pre-registered and is not tuned per fixture.

---

## 11. Report format

Per acceptance criterion in §7: pass or fail with real evidence. Then:

- `npm ci`, `npm run build`, `npm test`, and `npm run screenshots` exit codes;
- the schema SHA-256, the generated file's banner hash, and the fresh-generation equality result;
- the fixture SHA-256 comparisons and the large-fixture regeneration result;
- the determinism evidence: same-process deep equality and the two-process SHA-256;
- the overlap, endpoint, and group-containment results, with counts checked;
- the five large-graph timings, median, p95, and the node/edge counts in Chromium;
- the 14 type tokens and the sync/async legend proof;
- the contrast results for both themes;
- the issue artifact counts for all four fixtures and the exact exporter command;
- the source-scan output for no network, no model, no validator runtime import, and no hand-written architecture types;
- the screenshot paths and dimensions;
- `git diff --stat`, confirming only `frontend/` and `docs/screenshots/step-5/` changed;
- the backend suite result (307 passed) and `scored_run_approved: false`;
- files created or changed;
- any deviation stated plainly.

No model is called. No scored run is made. No result is reported for a model.

---

## 12. Stop condition

I implement only the paths in §5, using the decisions in §10. I do not call a model or a provider. I do not wire the frontend to generation, retry, the harness, the evaluator, or the validators at runtime. I do not touch `backend/`, `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`. I do not set `scored_run_approved`. I do not start step 6.

I run the frontend tests, the backend suite, and the screenshot capture; I report with real evidence; I commit and push to `origin/main`.

Then I stop and wait for **approved** on step 5.
