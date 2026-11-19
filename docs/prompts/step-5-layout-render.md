# Step 5 — Deterministic Layout and Render

**Step prompt · v2 · 19 November 2026 · approved with changes; build proceeds**
**Source of truth:** project document v1.2 §4.5, §6.8, §8.9; `README.md` “Principles”; `docs/step-1-data-model.md` §2, §6.7 and §9; `docs/prompts/step-4-validators.md` §5.1 and §6.5.

> v2 is the build contract. It records the review decisions and five changes on top of v1. No model or provider is called, and no scored run is made. `scored_run_approved` stays `false`.

### Changes from v1

1. **Decisions resolved:** Vite; view-only canvas; edge labels always shown with technology in the side panel; light and dark themes.
2. **Malformed drafts must not crash layout or render.** A schema-valid draft that breaks the soft rules is normalised deterministically, and every dropped or adjusted item is listed in a new “Layout adjustments” side-panel section. The cases are: a component in two groups, group nesting deeper than one level, a group with a missing parent, self-loop connections, parallel connections between the same pair, and duplicate labels. The broken fixture carries these cases, and its issue artifact is regenerated only by the exporter.
3. **Performance thresholds stay as pre-registered.** The 2000 ms p95 and 5000 ms worst-case bounds are not relaxed. If they are missed, the measured numbers and options are reported; the ELK option block is not changed to hit them.
4. **One additional screenshot:** `large-light-zoom.png`, a cropped region of the large graph at roughly 100% zoom.
5. **Dependency policy and README:** exact versions, committed lockfile, `npm ci`, no direct dependency release published in the last 14 days, and a reported `npm audit` summary. A short `frontend/README.md` documents install, test, build, and screenshot commands.

---

## 1. Goal

Render an `ArchitectureDraft` as a clean, deterministic architecture diagram in a local React application.

The draft is loaded from committed fixtures. A pure layout function normalises the graph, turns it into coordinates with `elkjs`, and React Flow draws the result. The architecture model never contains a coordinate, a size, or a style. The same input must always produce the same diagram.

This step proves the render half of the pipeline:

```
ArchitectureDraft (fixture) -> normalise -> deterministic layout (elkjs) -> React Flow canvas
```

It does **not** call a model, does not connect to generation, retry, or the harness, and does not write anything back into an architecture.

---

## 2. In scope

- A local frontend under `frontend/`: React + TypeScript + React Flow + elkjs, bundled with Vite.
- TypeScript architecture types generated from `schema/architecture.generation.schema.json` by a committed script, never hand-written, with a drift test.
- A deterministic, headless-testable `layoutArchitecture(draft)` function using elkjs layered layout, left to right, groups as containers with one nesting level, and edge-label space reserved.
- Deterministic normalisation of schema-valid drafts that break the soft rules, with every dropped or adjusted item listed in the side panel.
- A read-only React Flow canvas with pan and zoom.
- A distinct, consistent node style for each of the 14 component types.
- Sync and async edges visually distinct, with a legend. Edge labels are always shown; edge technology is shown in the side panel.
- Component technology shown on the node; assumed elements visibly marked.
- A side panel showing requirements, assumptions, flags, layout adjustments, and the legend.
- A read-only validator-issues panel fed by committed `validate_graph` output artifacts.
- A locked canvas state that disables pan, zoom, selection, and dragging, for the later agent-running phase.
- Headless screenshots of both fixtures, the 120-component / 300-connection graph, and a 100%-zoom crop, committed under `docs/screenshots/step-5/`.
- Light and dark themes.
- Unit, component, determinism, performance, and end-to-end tests.
- A short `frontend/README.md` with install, test, build, and screenshot commands.

## 3. Out of scope

- Any generation call, model call, provider call, retry, harness, or scored run. `scored_run_approved` stays `false`.
- Wiring the frontend to the backend, to `app.llm`, to `app.eval`, or to the validators at runtime.
- Editing the architecture, adding or deleting elements, or mutating the draft.
- Auto-fixing, rewriting, or deleting malformed graph elements. The frontend normalises only for layout and display; the draft is unchanged.
- Export (PNG, SVG, PDF, JSON), persistence, local storage, a database, auth, users, or collaboration.
- Saving dragged positions or position overrides. The layout stays pure and deterministic in this step.
- Any change to `eval/`, `prompts/system/`, `eval/freeze.json`, `backend/app/eval/`, `backend/app/llm/`, `backend/app/validation/`, `backend/app/model/`, or `schema/`.
- New component types, connection types, architecture fields, or schema changes.
- A design system, a component library, animation, or a mobile layout.
- Deployment, a server, SSR, routing beyond a single page, or a cloud screenshot service.
- Step 6. No integration endpoint is built here.

---

## 4. Inputs from earlier steps

- `schema/architecture.generation.schema.json` — frozen `ArchitectureDraft` schema, draft 2020-12, SHA-256 `0033E0C195B72B0E822CD4DCA8A4C3EB418AEB22765A66F04E90448A760FC89F`. This is the only source of the architecture types.
- `schema/architecture.stored.schema.json` — frozen stored schema, SHA-256 `1E9C1EE76533E1437EE7B402BE18090A82CDB4448B15E0D7CD036579981DA995`. Not used by the frontend; listed to confirm it is untouched.
- `backend/tests/fixtures/small_architecture.json` — 5 components, clean, no validator issues.
- `backend/tests/fixtures/full_coverage_architecture.json` — full type coverage, one async cycle, clean, no validator issues.
- `backend/app/model/enums.py` — `ComponentType` (14 values), `ConnectionType` (`sync`, `async`), `IssueSeverity` (`invalid`, `judgment`).
- `backend/app/model/issues.py` — `Issue` fields used by the read-only panel: `kind`, `severity`, `element_id`, `message`.
- `backend/app/model/architecture.py` — `check_references()` already reports `component_in_multiple_groups`, `group_nesting_too_deep`, `unknown_group_parent`, `self_parent_group`, and `unknown_group_member`; the exporter records them.
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
    README.md                        # install, test, build, screenshots
    package.json                     # exact versions, no ranges
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
      check-dependency-dates.mjs     # verifies no direct release is < 14 days old
    src\
      main.tsx
      App.tsx
      app\
        modes.ts                     # query parsing: fixture, theme, locked, labels, focus, zoom
      types\
        architecture.generated.ts    # generated; never edited by hand
        schema.ts                    # committed SCHEMA_SHA256 constant
        issues.ts                    # small display type for Issue (not part of the architecture schema)
      fixtures\
        small_architecture.json      # byte-identical copy of the backend fixture
        full_coverage_architecture.json
        broken_architecture.json     # frontend-only fixture with all malformed cases
        large_architecture.json      # generated 120 components / 300 connections
        issues\
          small_architecture.issues.json
          full_coverage_architecture.issues.json
          broken_architecture.issues.json
          large_architecture.issues.json
      layout\
        layoutTypes.ts               # LayoutResult, LayoutAdjustment, coordinates
        nodeSizes.ts                 # pure, fixed node and group sizing
        normalize.ts                 # soft-rule normalisation and adjustment notes
        elkOptions.ts                # the frozen elkjs option object
        layout.ts                    # layoutArchitecture(draft)
      render\
        Canvas.tsx                   # React Flow wrapper; read-only and locked modes
        nodes\ComponentNode.tsx
        nodes\GroupNode.tsx
        edges\ArchitectureEdge.tsx
        Legend.tsx
        SidePanel.tsx
        AdjustmentsPanel.tsx
        IssuesPanel.tsx
        Toolbar.tsx
        theme.ts                     # per-type color tokens and theme tokens
        styles.css
      test\
        types-drift.test.ts
        fixtures.test.ts
        layout.test.ts
        malformed.test.ts
        layout-performance.test.ts
        render.test.tsx
        locked.test.tsx
        issues-panel.test.tsx
        dependencies.test.ts
        theme.test.ts
    e2e\
      screenshots.spec.ts
  docs\screenshots\step-5\
    small-light.png
    full-light.png
    large-light.png
    large-light-zoom.png
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
- `broken_architecture.json` is a frontend-only, schema-valid variant of the small fixture. It adds, without changing the backend fixtures:
  - one isolated service (`disconnected_component`);
  - one `database -> client` connection (`invalid` pairing);
  - one `client -> cache` connection (`judgment` pairing);
  - a component listed in two groups;
  - a group nested under a group that already has a parent;
  - a group whose `parent_id` is missing;
  - a sync self-loop;
  - two parallel connections between the same pair;
  - duplicate component names and duplicate connection labels.
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

The exporter lives in `frontend/scripts/`, runs under the backend virtual environment, and is not part of the app bundle. The frontend never imports Python, never calls the backend, and never runs the validators. The broken-fixture artifact is regenerated by running the exporter; it is never hand-edited.

### 5.4 Layout module

`layoutArchitecture(draft: ArchitectureDraft): Promise<LayoutResult>` is pure with respect to the draft: it does not mutate the input and does not read the DOM. It calls `normalizeDraft` first, then ELK. `LayoutResult` is the only type that contains `x`, `y`, `width`, and `height`, and it also carries the adjustment notes.

### 5.5 Render components

React Flow (`@xyflow/react`) renders `LayoutResult`. Node and edge components are display-only. No node or edge component writes to the draft or to layout state.

### 5.6 Screenshots

Committed PNGs under `docs/screenshots/step-5/`. They are produced by Playwright from the built app with a fixed viewport, fixed theme, and animations disabled.

---

## 6. Proposed design

### 6.1 Stack and app shell

- React + TypeScript, bundled by Vite 7.
- `@xyflow/react` for the canvas; `elkjs` for layout.
- `vitest` + `@testing-library/react` + `happy-dom` for unit and component tests; `@playwright/test` for screenshots.
- One page. A top toolbar shows the fixture name, theme toggle, edge-label toggle, fit button, and a lock indicator. The canvas fills the viewport; the side panel is a fixed-width column on the right.
- URL parameters make every screenshot deterministic:
  - `?fixture=small|full|large|broken`
  - `?theme=light|dark`
  - `?locked=1`
  - `?labels=all|none` (default `all`)
  - `?focus=<component-id>&zoom=1` (default zoom is fit-to-view)
- With no parameters, the app opens the small fixture, follows `prefers-color-scheme`, is unlocked, and shows labels.
- The canvas container exposes `data-layout-ready="true"` after the first React Flow render, plus `data-fixture`, `data-theme`, and `data-locked`. Tests and screenshots wait on those attributes instead of sleeping.

### 6.2 Type generation and drift guard

`scripts/generate-types.mjs`:

1. reads `schema/architecture.generation.schema.json` as bytes;
2. computes SHA-256;
3. generates the TypeScript with a pinned tool and fixed options (`bannerComment` built from the four header lines, no timestamps, stable property order);
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

### 6.4 Deterministic layout and soft-rule normalisation

`layoutArchitecture` builds an ELK graph from a **normalised** draft. The draft itself is never mutated.

**Normalisation order** (deterministic, independent of array order):

1. Sort groups, components, and connections by `id`.
2. **Group parent normalisation.** For each group, follow `parent_id` with a visited set.
   - Self-parent, unknown parent, a cycle, or a chain longer than one parent is flattened to top-level.
   - Each flattened group gets a `group-parent` adjustment note naming the group and the reason.
   - A group with one parent remains nested one level; deeper chains are flattened.
3. **Group membership normalisation.** Build a component-to-groups map from the normalised groups.
   - A component in more than one group is assigned to the first group by sorted group id.
   - It is removed from the other groups, and a `group-membership` note names the component, the chosen group, and the dropped groups.
   - A group member that is not a component is skipped with an `unknown-member` note.
   - A group left with no members and no child groups is omitted with an `empty-group` note.
4. **Connections.** Keep every connection whose endpoints exist.
   - A connection with an unknown endpoint is skipped with an `unknown-endpoint` note.
   - A self-loop is kept and gets a `self-loop` note.
   - Two or more connections with the same ordered `(from, to)` pair are kept and get one `parallel-edges` note per pair, listing every connection id.
5. **Duplicate labels.** Keep every element.
   - Duplicate component names get a `duplicate-component-name` note per duplicated name.
   - Duplicate connection labels get a `duplicate-connection-label` note per duplicated label.
   - Duplicate group names get a `duplicate-group-name` note per duplicated name.

`LayoutResult.adjustments` is an ordered list of `{ kind, message, elementIds }`. The order is the order above, then element id, then kind. The side panel renders every note. No note is dropped or truncated silently; the message cap is 400 characters, and a note that would exceed it is split or summarised with a count.

**ELK graph construction:**

- Sort components, connections, and groups by `id` before building the graph. Input array order must not affect the result.
- One ELK node per component. Fixed size from `nodeSizes.ts`: **220 × 88** for every component. Fixed sizes are required for headless determinism; content measurement in the DOM is not allowed.
- One ELK node per group, as a container. Groups may contain components and at most one level of child groups after normalisation.
- Components outside a group are top-level nodes.
- One ELK edge per normalised connection. Self-loops and parallel edges are included.
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
elk.padding: "[top=44,left=28,bottom=28,right=28]"
```

These options are a pre-registered constant. They may not be tuned per fixture, per malformed case, or to make a screenshot or a timing bound look better. The same padding block is set on every group node.

**Result normalisation for React Flow:**

- group position is absolute for top-level groups and relative to its parent for a nested group;
- child position is relative to its group, and parent nodes are ordered before their children in the nodes array;
- every component, group, and edge label has `x`, `y`, `width`, `height`;
- the result also carries the overall canvas width and height, and an absolute position for every node for focus and tests.

`LayoutResult` is the only place coordinates exist. The generated architecture types contain no `x`, `y`, `position`, `width`, or `height` field. A test scans the fixture JSON for those keys at model level; `attributes` values are strings and are never interpreted as geometry.

Determinism is proven twice: two calls in one process are deep-equal, and two separate Node processes running `scripts/layout-hash.mjs` through `tsx` print the same SHA-256 for the same fixture.

**Performance.** The large-fixture measurement is kept and reported. The bounds are pre-registered: p95 < 2000 ms over 5 runs and a worst run < 5000 ms, in Node on this machine. If a bound is missed, the report states the measured numbers and proposes options (for example, a different ELK algorithm, a coarser node size, or a future worker). The ELK option block is **not** changed to hit the bound.

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
- Every edge label shows the connection `label` (truncated to 28 characters, full text in the side panel). Edge technology is shown in the side panel when the edge is selected.
- An assumed connection gets an `A` badge on its label.
- An edge referenced by a validator issue gets the same severity dot as a node.
- A self-loop is drawn as a visible loop; it is not silently dropped.
- Parallel edges are drawn as separate paths with distinct labels, not merged.
- A legend is always visible in the side panel: sync (solid), async (dashed), assumed (dashed border + pill), issue severity (`invalid`, `judgment`), plus the 14 type colors and glyphs.

### 6.7 Side panel

A read-only column with collapsible sections and live counts:

- **Overview** — title, summary, counts (components, connections, groups, requirements).
- **Requirements** — id, kind, source, text.
- **Assumptions** — id, scope, text, rationale, element refs.
- **Flags** — severity (`blocking` / `warning`), kind, description, requirement refs.
- **Layout adjustments** — every note from `LayoutResult.adjustments`, with a count. Empty state: “No layout adjustments”. This is where a dropped group membership, a flattened group, a self-loop, parallel edges, and duplicate labels are listed.
- **Legend** — as in §6.6.

Clicking a component, group, or connection in the unlocked canvas highlights it and opens its details: id, type, technology, description, requirement refs, assumed/rationale, and the issues that name it. This is selection for inspection, not editing.

### 6.8 Validator issues panel

A separate read-only tab or section fed only by the committed `*.issues.json` artifacts.

- Header: fixture name, `rules_version`, total count, and counts by severity.
- One row per issue: severity badge (`invalid` / `judgment`), kind, element id, message.
- The clean fixtures show an explicit “No issues” empty state.
- The broken fixture shows a non-empty list with at least one `invalid` and one `judgment` row, including the group-cardinality issues from `check_references()`.
- No controls mutate the graph. No “fix”, “apply”, “dismiss”, or “regenerate” action exists.
- The issues are never fed back into generation, retry, the harness, or any model prompt. The runtime has no code path from this panel to the draft.
- The broken-fixture artifact is produced by `export-fixture-issues.py`; it is not hand-edited.

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
| `large-light-zoom.png` | large | light | `?focus=<id>&zoom=1`, canvas crop at ~100% |
| `broken-issues-light.png` | broken | light | issues panel open |
| `locked-light.png` | small | light | `?locked=1` |
| `small-dark.png` | small | dark | default view |
| `full-dark.png` | full | dark | default view |
| `large-dark.png` | large | dark | fit-to-view, 120/300 |

Viewport 1600 × 1000, device scale factor 1. Each capture waits for `[data-layout-ready="true"]` and `document.fonts.ready`, asserts there are no console errors, and then screenshots. The large-graph capture also asserts 120 rendered component nodes and 300 rendered edges before the shot. The zoom capture centres a chosen component at zoom 1 and clips the canvas region, so the image shows a readable neighbourhood rather than the whole graph.

The committed list must match the approved decision. With light and dark approved, all nine files are required.

### 6.12 Accessibility and resilience

- Every node has an accessible name: component name, type, and technology.
- The legend and panels use real text, not color alone.
- Keyboard focus is visible in the unlocked state; the locked state removes canvas focus.
- A malformed fixture, a missing issue artifact, an edge with an unknown endpoint, or a malformed group is normalised or skipped with a visible note, never a blank crash.
- A React error boundary wraps the canvas and shows the error text, so a layout failure is visible and reportable.

### 6.13 Dependencies and supply chain

- Every direct dependency is pinned to an exact version in `package.json` (no `^`, `~`, `latest`, or range).
- `package-lock.json` is committed, and install uses `npm ci`.
- No direct dependency version selected may have been published in the last 14 days (cutoff 5 November 2026 for this build). `scripts/check-dependency-dates.mjs` queries the npm registry and prints each direct dependency's version and publish date; it fails if a selected version is too new.
- The report lists every direct dependency with its exact version and publish date, plus the full `npm audit` summary.
- Audit findings are reported, not auto-fixed. `npm audit fix` is not run, and no dependency is changed silently to clear a finding.

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
9. Every edge in `LayoutResult` refers to an existing source and target component; every normalised connection appears exactly once. An edge with an unknown endpoint is skipped and counted, not rendered and not fatal.
10. Every group member rectangle lies fully inside its group rectangle, with the declared padding. No component belongs to more than one group after normalisation, and no group is nested more than one level.
11. A schema-valid malformed draft does not crash layout or render for each of: a component in two groups, group nesting deeper than one level, a group with a missing parent, a self-loop, parallel connections between the same pair, and duplicate labels. Each case produces at least one adjustment note, and the note is visible in the side panel.
12. The broken fixture is schema-valid, contains every malformed case, and its issue artifact is regenerated by the exporter, never hand-edited. The artifact contains at least one `invalid` and one `judgment` issue.
13. The 120-component / 300-connection layout completes with p95 < 2000 ms over 5 runs and a worst run < 5000 ms, measured in Node on this machine. If either bound is missed, the numbers and proposed options are reported; the ELK options are unchanged.
14. A headless Chromium page renders the 120-component / 300-connection fixture with 120 component nodes and 300 edges, no console error, and no crash.
15. Each of the 14 component types has a distinct accent color and a distinct two-letter glyph. A test asserts 14 unique colors and 14 unique glyphs, and that every type is covered.
16. Sync and async edges are visually different by stroke pattern and arrowhead; the legend names both; a test asserts the difference and the legend text. Edge labels are always shown; edge technology is in the side panel.
17. Component technology is shown on the node when present. Assumed components, groups, and connections are visibly marked. The side panel lists every assumption, flag, and layout adjustment in the fixture, with counts that match.
18. The read-only issues panel renders the committed `validate_graph` artifacts: zero for both clean fixtures, non-zero for the broken fixture. It has no control that mutates the draft, and no runtime import of the validators.
19. The default canvas is view-only: nodes cannot be dragged or connected, and pan and zoom work.
20. The locked canvas disables pan, zoom, selection, and focus, and shows a lock indicator.
21. All nine approved screenshots exist under `docs/screenshots/step-5/`, each 1600 × 1000, including `large-light-zoom.png`, and `npm run screenshots` exits 0.
22. Light and dark token pairs meet at least 4.5:1 contrast for node text; `theme.test.ts` proves it for both themes.
23. Every direct dependency in `package.json` is an exact version, the lockfile is committed, and `npm ci` is the documented install. `scripts/check-dependency-dates.mjs` passes with every selected version older than 14 days, and the report lists every direct dependency with version and publish date plus the `npm audit` summary.
24. `frontend/README.md` documents install (`npm ci`), test, build, and screenshot commands, and they work.
25. A source scan of `src/**/*.{ts,tsx}` (excluding committed fixtures) finds no `fetch(`, `XMLHttpRequest`, `axios`, model-provider client, `localhost`, `127.0.0.1`, `validate_graph`, `app.validation`, or `child_process`.
26. `package.json` contains no HTTP client, model SDK, backend client, or state-persistence dependency.
27. No file under `backend/`, `eval/`, `prompts/system/`, or `schema/` is modified. `eval/freeze.json` still has `scored_run_approved: false`.
28. The backend suite still passes with 307 tests.
29. The changes are committed and pushed to `origin/main`.

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
3. The broken fixture is schema-valid, contains every malformed case, and its artifact contains both severities.
4. No fixture contains a model-level `x`, `y`, `position`, `width`, or `height` key.
5. Every issue artifact has `fixture`, `rules_version`, and `issues`, and each issue has exactly `kind`, `severity`, `element_id`, `message`.

`layout.test.ts`

1. Same fixture, two calls: deep-equal results.
2. Two child processes: identical SHA-256 for the same fixture.
3. No overlapping node rectangles, excluding ancestor/descendant pairs.
4. Every edge endpoint exists; every normalised connection appears once.
5. Every group member is inside its group; groups do not overlap; one nesting level.
6. A dangling edge is skipped and counted without throwing.
7. The layout output is the only object with coordinates: a recursive scan of the draft and of `LayoutResult` proves the draft has none and the result has them.

`malformed.test.ts`

One layout test per case, each starting from a valid draft and applying only that malformation:

1. Component in two groups: assigned to the first sorted group, removed from the other, `group-membership` note present, one group membership in the result.
2. Group nesting deeper than one level: flattened to top-level, `group-parent` note present, maximum depth one.
3. Group with a missing parent: treated as top-level, `group-parent` note present.
4. Self-loop: kept, `self-loop` note present, a path exists in the result.
5. Parallel connections: both kept, one `parallel-edges` note listing both ids, both edges in the result.
6. Duplicate component names, connection labels, and group names: all kept, one note per duplicated label kind, counts match.
7. Combined broken fixture: no throw, every note kind present, and the adjustment order is deterministic across two calls.

`layout-performance.test.ts`

1. Large fixture: 5 runs, p95 < 2000 ms, worst < 5000 ms; print all five timings. If a bound is missed, the test reports the numbers and fails the criterion; it does not change the ELK options.
2. Small and full fixtures: layout under 1000 ms each; print timings.

`dependencies.test.ts`

1. Every dependency and devDependency in `package.json` is an exact version (no range characters).
2. `package-lock.json` exists and its root package versions match `package.json`.
3. No dependency is `latest`, a git URL, or a file path.

`theme.test.ts`

1. 14 unique accent colors and 14 unique glyphs; every `ComponentType` covered.
2. Node text/background contrast is at least 4.5:1 in light and dark.

### 8.2 Component (Vitest + React Testing Library)

`render.test.tsx`

1. Small fixture renders 5 component nodes, its connections, and its groups.
2. Full fixture renders every component and connection; sync and async edges carry different classes.
3. Technology text appears on nodes that declare it; edge labels are always present.
4. Assumed components, groups, and connections carry the assumed marker.
5. The side panel counts for requirements, assumptions, and flags match the fixture.
6. The issues panel shows “No issues” for both clean fixtures.

`malformed.test.ts` (render half)

One render test per case, using the same per-case drafts:

1. Component in two groups: renders without throwing and shows the `group-membership` note.
2. Deep group nesting: renders and shows the `group-parent` note.
3. Missing group parent: renders and shows the `group-parent` note.
4. Self-loop: renders the loop and shows the `self-loop` note.
5. Parallel connections: renders both edges and shows the `parallel-edges` note.
6. Duplicate labels: renders all elements and shows the duplicate-label notes.
7. Combined broken fixture: renders all notes in the side panel and does not crash.

`issues-panel.test.tsx`

1. The broken fixture artifact renders a non-empty list with both `invalid` and `judgment` severity badges.
2. No button or control mutates the draft; the rendered panel has no `onClick` that changes graph state.
3. The panel text matches the artifact messages.

`locked.test.tsx`

1. Default: pan and zoom are enabled; nodes are not draggable; nodes are not connectable.
2. Locked: pan, zoom, selection, and focus are disabled; the lock indicator is visible.
3. Locked still renders the same node and edge counts.

### 8.3 End-to-end and screenshots (Playwright)

`screenshots.spec.ts`

1. For each of the nine approved files in §6.11: load the URL, wait for layout ready and fonts, assert no console errors, assert the expected node/edge counts, screenshot to the exact path.
2. Large fixture: assert 120 component nodes and 300 edges before capture.
3. Zoom capture: set `?focus=<id>&zoom=1`, assert the viewport zoom is 1, and clip the canvas region.
4. Locked: assert the lock indicator and that the viewport does not change after a drag attempt.
5. Broken: open the issues panel and the adjustments panel, assert non-zero counts, then capture.

### 8.4 Negative and drift proofs

- The type drift test runs the generator against a temporary schema copy, not the frozen file.
- The fixture drift test compares hashes; it does not rewrite the backend fixtures.
- The no-network test scans source text; it does not need a running server.
- The malformed tests build in-memory draft copies; the committed fixtures are unchanged except for the broken fixture.
- The lock test attempts a drag and asserts the viewport transform is unchanged.
- The dependency-date script reads the registry and package.json; it does not install or upgrade anything.

---

## 9. Edge cases and risks

- **ELK workers versus bundling.** Use `elkjs/lib/elk.bundled.js` so layout runs in Node tests and in the browser without a worker-file path problem. A worker-based setup would make headless tests and the Vite build fragile.
- **DOM measurement breaks determinism.** Node sizes are fixed constants. No `ResizeObserver`, no text measurement, no font-dependent sizing. Text that does not fit is clipped with a tooltip; the box never changes.
- **Input order changes layout.** Sort components, connections, and groups by id before building the ELK graph, and set `considerModelOrder` so ELK preserves that order.
- **ELK nondeterminism across processes.** The cross-process hash test is the guard. If it ever differs, the layout is not shippable; the fix is options and ordering, never a looser test.
- **Group coordinate systems.** ELK child coordinates are relative to the parent; React Flow child positions are relative to the parent group. The adapter must convert once, in one place, and the containment test checks the result in absolute coordinates.
- **Group overlap with top-level nodes.** Groups are ELK parents, so ELK should separate them. The overlap test excludes only ancestor/descendant pairs; a group overlapping an unrelated top-level node is a failure.
- **Malformed group graphs can be cyclic.** Parent resolution uses a visited set. A cycle is flattened to top-level, not followed forever.
- **A component in two groups.** The first group by sorted id wins. This is deterministic, but it is a data loss for the other group; the note makes it visible. The group left empty is omitted with a note.
- **Self-loops and parallel edges.** ELK may route them unusually. The layout must keep them; the render must draw a visible loop and separate parallel paths. If ELK omits a section, the render falls back to a deterministic manual loop or smooth-step path and the note remains.
- **Duplicate labels.** Duplicate names are legal in the schema. The render must show both; the note reports the duplicate. The issues panel does not invent an issue for them.
- **Edge labels collide.** ELK reserves label space; the test checks node overlap, and the screenshot review checks label legibility. Labels are truncated, never reflowed into a second line.
- **A very wide large graph.** Left-to-right layout of 120 nodes and 300 edges produces a wide canvas. Fit-to-view makes nodes small in the stress shot; the zoom shot is the readable region. The requirement is no crash and a complete graph.
- **Performance bounds are not tuning targets.** If the p95 or worst-case bound is missed, the report gives the numbers and options. Changing the ELK options to pass would invalidate the pre-registered measurement.
- **Issue artifacts can go stale.** `npm run screenshots` runs the exporter first. The report records the exact exporter command and the artifact counts. A stale artifact is visible as a count mismatch in the report.
- **The exporter is Python in a frontend folder.** It is a dev-only, one-way artifact generator. It is not imported by `src/`, not bundled, and not shipped. The runtime has no Python or backend dependency.
- **Hand-written `Issue` type.** `Issue` is not in the architecture schema, so it cannot be generated from the frozen artifact. The display type is four fields, pinned by a test against the artifacts.
- **Playwright screenshots are machine-dependent.** Font rasterisation differs across operating systems. The committed images are from this machine, at a fixed viewport and scale. They are review evidence, not a pixel-perfect CI oracle.
- **Read-only drift.** A future edit feature could be tempted to write back into the draft. This step has no mutation path; the lock and read-only tests pin it.
- **Dependency drift.** Exact versions and a lockfile are the guard. The date check is a report gate, not an auto-upgrade. Audit findings are reported, not silently fixed.
- **Scope creep.** No export, persistence, auth, routing, model calls, or step-6 endpoint. A request for any of these is a later step, not a quiet addition here.

---

## 10. Decisions (resolved in review)

1. **Bundler — Vite.** A static SPA, one `vite build`, native Vitest and Playwright integration. No server or SSR.
2. **Interaction — view-only now.** Pan and zoom only; nodes are not draggable. `LayoutResult` stays pure, and a future `positionOverrides` map can be merged in a view-model layer without changing the layout algorithm. The locked state is built now for the later agent-running phase.
3. **Edge label density — labels always; technology in the side panel.** The connection label is the primary reading; edge technology is one click away. Component technology is always on the node.
4. **Theme — light and dark.** Both are committed as screenshots; the query parameter keeps captures deterministic.

No decisions remain open. Node sizing is fixed at 220 × 88 by design, because content measurement would make the layout non-deterministic. The elkjs option block in §6.4 is pre-registered and is not tuned per fixture.

---

## 11. Report format

Per acceptance criterion in §7: pass or fail with real evidence. Then:

- `npm ci`, `npm run build`, `npm test`, and `npm run screenshots` exit codes;
- the schema SHA-256, the generated file's banner hash, and the fresh-generation equality result;
- the fixture SHA-256 comparisons, the large-fixture regeneration result, and the exporter command that regenerated the broken-fixture artifact;
- the determinism evidence: same-process deep equality and the two-process SHA-256;
- the overlap, endpoint, and group-containment results, with counts checked;
- the six malformed-case results: layout and render, with the adjustment note shown for each;
- the five large-graph timings, median, p95, and the node/edge counts in Chromium;
- if a performance bound is missed, the measured numbers and the proposed options, with the ELK options unchanged;
- the 14 type tokens, the sync/async legend proof, and the edge-label/technology placement proof;
- the contrast results for both themes;
- the issue artifact counts for all four fixtures, including the group-cardinality issues in the broken fixture;
- every direct dependency with exact version and publish date, the 14-day check result, and the full `npm audit` summary; any finding is reported, not fixed;
- the source-scan output for no network, no model, no validator runtime import, and no hand-written architecture types;
- the nine screenshot paths and dimensions, including `large-light-zoom.png`;
- `git diff --stat`, confirming only `frontend/` and `docs/screenshots/step-5/` changed;
- the backend suite result (307 passed) and `scored_run_approved: false`;
- files created or changed;
- any deviation stated plainly.

No model is called. No scored run is made. No result is reported for a model.

---

## 12. Stop condition

I implement only the paths in §5, using the decisions in §10. I do not call a model or a provider. I do not wire the frontend to generation, retry, the harness, the evaluator, or the validators at runtime. I do not touch `backend/`, `eval/`, `prompts/system/`, `eval/freeze.json`, or `schema/`. I do not set `scored_run_approved`. I do not start step 6.

I run the frontend tests, the backend suite, and the screenshot capture; I report with real evidence; I commit and push to `origin/main`.

Then I stop and wait for **approved** on step 5. After that approval, I draft `docs/prompts/step-6-integration.md` with no code. Step 6 is not built until the evaluation gate has chosen a model.
