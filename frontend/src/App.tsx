import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiRequestError, createRun, getRun } from './api/client';
import type { GetRunResponse, RunErrorCode, RunResult } from './api/types';
import {
  ELAPSED_TICK_MS,
  LAYOUT_FAILURE_MESSAGE,
  POLL_INTERVAL_MS,
  errorMessage,
  isValidRunResult,
  normalizeErrorCode,
  prepareCommit,
  type PendingRun,
  type RunErrorView,
} from './app/live';
import { parseMode, type LiveEntry, type ThemeName } from './app/modes';
import type { ArchitectureDraft, Component, Connection, Group } from './types/architecture.generated';
import { layoutArchitecture, type LayoutResult } from './layout/layout';
import { Canvas } from './render/Canvas';
import { downloadSvg, toMermaid } from './render/diagramExport';
import { ErrorBoundary } from './render/ErrorBoundary';
import { PromptBox } from './render/PromptBox';
import { RunStatus } from './render/RunStatus';
import { SidePanel } from './render/SidePanel';
import type { Selection } from './render/selection';
import { Toolbar } from './render/Toolbar';

interface Committed {
  entry: LiveEntry;
  layout: LayoutResult;
}

const EMPTY_LAYOUT: LayoutResult = {
  title: 'Untitled system',
  nodes: [],
  edges: [],
  adjustments: [],
  width: 0,
  height: 0,
};

function blankDocument(): Committed {
  return {
    entry: {
      name: 'live',
      label: 'Untitled system',
      file: 'canvas',
      draft: {
        title: 'Untitled system',
        summary: '',
        requirements: [{
          id: 'req_canvas',
          text: 'User-created system design.',
          kind: 'functional',
          source: 'inferred',
        }],
        components: [],
        connections: [],
        groups: [],
        assumptions: [],
        flags: [],
      },
      issues: { fixture: 'canvas', rules_version: '1.1', issues: [] },
    },
    layout: EMPTY_LAYOUT,
  };
}

function nextId(prefix: string, existing: string[]): string {
  let suffix = 1;
  while (existing.includes(`${prefix}_manual_${suffix}`)) suffix += 1;
  return `${prefix}_manual_${suffix}`;
}

function canvasRequirement(draft: ArchitectureDraft): { draft: ArchitectureDraft; id: string } {
  const existing = draft.requirements.find((item) => item.id === 'req_canvas');
  if (existing !== undefined) return { draft, id: existing.id };
  const id = nextId('req', draft.requirements.map((item) => item.id));
  return {
    id,
    draft: {
      ...draft,
      requirements: [...draft.requirements, {
        id,
        text: 'The user is composing this architecture on the canvas.',
        kind: 'functional',
        source: 'inferred',
      }],
    },
  };
}

function layoutWithPositions(
  layout: LayoutResult,
  positions: Record<string, { x: number; y: number }>,
): LayoutResult {
  return {
    ...layout,
    nodes: layout.nodes.map((node) => {
      const position = positions[node.id];
      return position === undefined ? node : { ...node, x: position.x, y: position.y };
    }),
  };
}

function refreshLayoutData(layout: LayoutResult, draft: ArchitectureDraft): LayoutResult {
  const components = new Map(draft.components.map((item) => [item.id, item]));
  const groups = new Map((draft.groups ?? []).map((item) => [item.id, item]));
  const connections = new Map((draft.connections ?? []).map((item) => [item.id, item]));
  return {
    ...layout,
    title: draft.title,
    nodes: layout.nodes.map((node) => node.kind === 'component'
      ? { ...node, component: components.get(node.id) }
      : { ...node, group: groups.get(node.id) }),
    edges: layout.edges.map((edge) => {
      const connection = connections.get(edge.id);
      return connection === undefined ? edge : {
        ...edge,
        label: connection.label,
        displayLabel: connection.label,
        type: connection.type,
        technology: connection.technology ?? null,
        assumed: connection.assumed,
      };
    }),
  };
}

export default function App() {
  const initial = useMemo(() => parseMode(window.location.search, true), []);
  const [theme, setTheme] = useState<ThemeName>(initial.theme);
  const [selection, setSelection] = useState<Selection>(null);
  const [committed, setCommitted] = useState<Committed>(blankDocument);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [runError, setRunError] = useState<RunErrorView | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const pendingRef = useRef<PendingRun | null>(null);
  const runIdRef = useRef<string>('');
  const pollTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const documentRequestRef = useRef(0);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const locked = pending !== null;
  const entry = committed.entry;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const updatePending = useCallback((next: PendingRun | null): void => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const stopTimers = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const finishRun = useCallback((): void => {
    stopTimers();
    updatePending(null);
  }, [stopTimers, updatePending]);

  const failRun = useCallback((code: RunErrorCode, message?: string): void => {
    generationRef.current += 1;
    setRunError({ code, message: message ?? errorMessage(code) });
    finishRun();
  }, [finishRun]);

  const schedulePoll = useCallback((): void => {
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = window.setTimeout(() => void pollRef.current(), POLL_INTERVAL_MS);
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    pollTimerRef.current = null;
    const runId = runIdRef.current;
    const mine = generationRef.current;
    if (runId === '' || pendingRef.current === null) return;

    let response: GetRunResponse;
    try {
      response = await getRun(runId);
    } catch {
      if (generationRef.current === mine) failRun('connection_lost');
      return;
    }
    if (generationRef.current !== mine || pendingRef.current === null) return;

    if (response.state === 'queued' || response.state === 'running') {
      updatePending({
        id: runId,
        state: response.state,
        elapsedMs: response.elapsed_ms,
        maxRunSeconds: response.max_run_seconds,
      });
      schedulePoll();
      return;
    }
    if (response.state === 'failed' || response.state === 'timeout') {
      failRun(normalizeErrorCode(response.error?.code));
      return;
    }
    if (response.state !== 'succeeded' || !isValidRunResult(response.result)) {
      failRun('schema_invalid');
      return;
    }

    const payload: RunResult = response.result;
    try {
      const layout = await layoutArchitecture(payload.draft);
      if (generationRef.current !== mine) return;
      setPositions({});
      setCommitted(prepareCommit(payload, layout));
      setSelection(null);
      setFitNonce((value) => value + 1);
      generationRef.current += 1;
      finishRun();
    } catch {
      if (generationRef.current === mine) failRun('internal_error', LAYOUT_FAILURE_MESSAGE);
    }
  }, [failRun, finishRun, schedulePoll, updatePending]);
  pollRef.current = poll;

  const submit = useCallback(async (prompt: string): Promise<void> => {
    if (pendingRef.current !== null) return;
    const mine = generationRef.current + 1;
    generationRef.current = mine;
    runIdRef.current = '';
    setRunError(null);
    setLayoutError(null);
    setSelection(null);
    updatePending({ id: '', state: 'running', elapsedMs: 0, maxRunSeconds: 0 });

    let created;
    try {
      created = await createRun(prompt);
    } catch (cause) {
      if (generationRef.current !== mine) return;
      if (cause instanceof ApiRequestError) {
        const code = normalizeErrorCode(cause.code);
        failRun(code, code === 'internal_error' ? cause.message : undefined);
      } else failRun('connection_lost');
      return;
    }
    if (generationRef.current !== mine) return;

    runIdRef.current = created.run_id;
    updatePending({ id: created.run_id, state: 'running', elapsedMs: 0, maxRunSeconds: created.max_run_seconds });
    tickTimerRef.current = window.setInterval(() => {
      const current = pendingRef.current;
      if (current !== null) updatePending({ ...current, elapsedMs: current.elapsedMs + ELAPSED_TICK_MS });
    }, ELAPSED_TICK_MS);
    await pollRef.current();
  }, [failRun, updatePending]);

  const commitStructure = useCallback((draft: ArchitectureDraft, select?: Selection): void => {
    if (pendingRef.current !== null) return;
    const request = ++documentRequestRef.current;
    const previousEntry = committed.entry;
    setLayoutError(null);
    void layoutArchitecture(draft).then((layout) => {
      if (request !== documentRequestRef.current) return;
      setCommitted({
        entry: {
          ...previousEntry,
          label: draft.title,
          draft,
          issues: { ...previousEntry.issues, fixture: 'edited canvas', issues: [] },
        },
        layout: layoutWithPositions(layout, positions),
      });
      if (select !== undefined) setSelection(select);
      setFitNonce((value) => value + 1);
    }).catch((cause: unknown) => {
      setLayoutError(cause instanceof Error ? cause.message : 'Could not lay out this change.');
    });
  }, [committed.entry, positions]);

  const addComponent = useCallback((): void => {
    const { draft, id: requirementId } = canvasRequirement(entry.draft);
    const id = nextId('cmp', draft.components.map((item) => item.id));
    const component: Component = {
      id,
      type: 'service',
      name: 'New box',
      technology: null,
      description: '',
      attributes: {},
      requirement_refs: [requirementId],
      assumed: false,
      rationale: null,
    };
    commitStructure({ ...draft, components: [...draft.components, component] }, { kind: 'component', id });
  }, [commitStructure, entry.draft]);

  const connectComponents = useCallback((source: string, target: string): void => {
    const { draft, id: requirementId } = canvasRequirement(entry.draft);
    if ((draft.connections ?? []).some((item) => item.from === source && item.to === target)) return;
    const id = nextId('cnx', (draft.connections ?? []).map((item) => item.id));
    const connection: Connection = {
      id,
      from: source,
      to: target,
      type: 'sync',
      label: 'Request',
      technology: null,
      requirement_refs: [requirementId],
      assumed: false,
      rationale: null,
    };
    commitStructure({ ...draft, connections: [...(draft.connections ?? []), connection] }, { kind: 'edge', id });
  }, [commitStructure, entry.draft]);

  const updateComponent = useCallback((id: string, patch: Partial<Component>): void => {
    setCommitted((current) => {
      const draft = { ...current.entry.draft, components: current.entry.draft.components.map((item) => item.id === id ? { ...item, ...patch } : item) };
      return {
        entry: { ...current.entry, draft, issues: { ...current.entry.issues, issues: [] } },
        layout: refreshLayoutData(current.layout, draft),
      };
    });
  }, []);

  const updateConnection = useCallback((id: string, patch: Partial<Connection>): void => {
    setCommitted((current) => {
      const draft = { ...current.entry.draft, connections: (current.entry.draft.connections ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) };
      return {
        entry: { ...current.entry, draft, issues: { ...current.entry.issues, issues: [] } },
        layout: refreshLayoutData(current.layout, draft),
      };
    });
  }, []);

  const updateGroup = useCallback((id: string, patch: Partial<Group>): void => {
    setCommitted((current) => {
      const draft = { ...current.entry.draft, groups: (current.entry.draft.groups ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) };
      return { entry: { ...current.entry, draft }, layout: refreshLayoutData(current.layout, draft) };
    });
  }, []);

  const deleteSelection = useCallback((target: Exclude<Selection, null>): void => {
    const draft = entry.draft;
    let next = draft;
    if (target.kind === 'component') {
      next = {
        ...draft,
        components: draft.components.filter((item) => item.id !== target.id),
        connections: (draft.connections ?? []).filter((item) => item.from !== target.id && item.to !== target.id),
        groups: (draft.groups ?? []).map((group) => ({ ...group, members: group.members.filter((id) => id !== target.id) })).filter((group) => group.members.length > 0),
      };
    } else if (target.kind === 'edge') {
      next = { ...draft, connections: (draft.connections ?? []).filter((item) => item.id !== target.id) };
    } else {
      next = { ...draft, groups: (draft.groups ?? []).filter((item) => item.id !== target.id).map((group) => group.parent_id === target.id ? { ...group, parent_id: null } : group) };
    }
    setPositions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== target.id)));
    setSelection(null);
    commitStructure(next);
  }, [commitStructure, entry.draft]);

  const updatePosition = useCallback((id: string, position: { x: number; y: number }): void => {
    setPositions((current) => ({ ...current, [id]: position }));
  }, []);

  const resetDocument = useCallback((): void => {
    documentRequestRef.current += 1;
    generationRef.current += 1;
    setCommitted(blankDocument());
    setPositions({});
    setSelection(null);
    setRunError(null);
    setLayoutError(null);
    setFitNonce((value) => value + 1);
  }, []);

  useEffect(() => () => stopTimers(), [stopTimers]);

  return (
    <div className="app" data-theme={theme} data-fixture={entry.name}>
      <Toolbar
        theme={theme}
        locked={locked}
        onAddComponent={addComponent}
        onNew={resetDocument}
        onTheme={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
        onFit={() => setFitNonce((value) => value + 1)}
        onDownload={() => downloadSvg(committed.layout, theme)}
        onCopy={() => navigator.clipboard.writeText(toMermaid(committed.layout))}
      />

      <div className="workspace">
        <main className="canvas-column">
          <div className="canvas-stage">
            {layoutError !== null ? <div className="canvas-toast" role="alert">{layoutError}</div> : null}
            <ErrorBoundary>
              <Canvas
                key="workbench"
                result={committed.layout}
                issues={entry.issues.issues}
                theme={theme}
                locked={locked}
                focus={initial.focus}
                zoom={initial.zoom}
                fitNonce={fitNonce}
                fixtureName="canvas"
                positions={positions}
                onSelect={(kind, id) => setSelection({ kind, id })}
                onClearSelection={() => setSelection(null)}
                onPositionChange={updatePosition}
                onConnect={connectComponents}
                onDelete={deleteSelection}
                onReady={() => {}}
              />
            </ErrorBoundary>
          </div>
          <PromptBox disabled={locked} onSubmit={(prompt) => void submit(prompt)} />
          <RunStatus run={pending} error={runError} />
        </main>

        <SidePanel
          entry={entry}
          selection={selection}
          onChangeComponent={updateComponent}
          onChangeConnection={updateConnection}
          onChangeGroup={updateGroup}
          onClearSelection={() => setSelection(null)}
          onDelete={() => selection !== null && deleteSelection(selection)}
        />
      </div>
    </div>
  );
}
