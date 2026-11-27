import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiRequestError, createRun, getRun, sendChat } from './api/client';
import type { ChatTurn } from './api/types';
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
import { displayEdgeLabel } from './layout/nodeSizes';
import { Canvas } from './render/Canvas';
import { downloadPng, downloadSvg, toMermaid } from './render/diagramExport';
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: 'working' | 'complete' | 'failed';
  activity?: 'chat' | 'design';
}

type RunIntent = 'create' | 'update';

interface ActiveChatRun {
  assistantId: string;
  intent: RunIntent;
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
        displayLabel: displayEdgeLabel(connection.label),
        type: connection.type,
        technology: connection.technology ?? null,
        assumed: connection.assumed,
      };
    }),
  };
}

function startsNewDesignRequest(text: string): boolean {
  const request = text.trim();
  return /^(?:(?:please|can you|could you|help me|i want to)\s+)?(design|architect|model)\b/i.test(request)
    || /^(?:(?:please|can you|could you|help me|i want to)\s+)?(create|build|draw|generate)\b.*\b(system|architecture|platform|application|app|website|product|backend|marketplace)\b/i.test(request)
    || /\b(from scratch|new system|new architecture|whole system|entire system|start over)\b/i.test(request);
}

function isConversationalMessage(text: string): boolean {
  const message = text.trim();
  return /[?]\s*$/.test(message)
    || /^(hi|hello|hey|hiya|heya|yo|sup|howdy|how are you|how r u|hru|thanks|thank you|thx|lol|lmao|nice|cool|okay|ok|great|awesome|good morning|good afternoon|good evening|what|why|who|when|where|explain|tell me|help me understand)\b/i.test(message);
}

function isArchitectureEditRequest(text: string): boolean {
  const message = text.trim();
  return /^(?:(?:please|can you|could you|can we|could we|let's|i want you to)\s+)*(add|insert|remove|delete|rename|connect|disconnect|move|reposition|resize|align|group|ungroup|relabel|simplify|adjust|change|update|replace|modify|switch|set)\b/i.test(message)
    || /^(?:(?:please|can you|could you|can we|could we|let's|i want you to)\s+)*(?:make|set|turn|change|update|replace|modify|adjust|simplify|space)\b.{0,80}\b(?:gateway|service|worker|database|cache|queue|component|connection|arrow|label|group|diagram|canvas|layout|spacing|async|sync|resilient|available|scalable|secure|faster|slower)\b/i.test(message);
}

function isArchitectureDescription(text: string): boolean {
  return /\b(system|architecture|platform|backend|website|web app|application|rate.?limiter|url shortener|ride.?sharing|e.?commerce|video streaming|payment system|chat app)\b/i.test(text);
}

function architectureContext(draft: ArchitectureDraft): string {
  const componentNames = new Map(draft.components.map((component) => [component.id, component.name]));
  const context = {
    title: draft.title,
    summary: draft.summary,
    components: draft.components.slice(0, 24).map((component) => ({
      name: component.name,
      type: component.type,
      technology: component.technology,
      description: component.description.slice(0, 120),
    })),
    connections: (draft.connections ?? []).slice(0, 32).map((connection) => ({
      from: componentNames.get(connection.from) ?? connection.from,
      to: componentNames.get(connection.to) ?? connection.to,
      label: connection.label,
      type: connection.type,
    })),
    omitted_components: Math.max(0, draft.components.length - 24),
    omitted_connections: Math.max(0, (draft.connections?.length ?? 0) - 32),
  };
  return JSON.stringify(context).slice(0, 3800);
}

function buildUpdatePrompt(draft: ArchitectureDraft, request: string): string {
  return [
    'Apply the user request as a targeted update to the existing architecture below.',
    'Do not redesign the system from scratch. Preserve existing component, connection, group, and requirement IDs and all unrelated design decisions.',
    'Only change what the user asks for. If adding or removing an element, keep every reference valid and preserve the required schema fields.',
    'Return the complete updated architecture object matching the supplied JSON Schema.',
    '',
    'Existing architecture JSON:',
    JSON.stringify(draft),
    '',
    'User request:',
    request,
  ].join('\n');
}

export default function App() {
  const initial = useMemo(() => parseMode(window.location.search, false), []);
  const [theme, setTheme] = useState<ThemeName>(initial.theme);
  const [selection, setSelection] = useState<Selection>(null);
  const [committed, setCommitted] = useState<Committed>(blankDocument);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [runError, setRunError] = useState<RunErrorView | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [overviewNonce, setOverviewNonce] = useState(0);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 760);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const pendingRef = useRef<PendingRun | null>(null);
  const runIdRef = useRef<string>('');
  const pollTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const documentRequestRef = useRef(0);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const chatSequenceRef = useRef(0);
  const activeChatRunRef = useRef<ActiveChatRun | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const locked = pending !== null;
  const entry = committed.entry;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container !== null) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const updatePending = useCallback((next: PendingRun | null): void => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const updateChatMessage = useCallback((id: string, patch: Partial<ChatMessage>): void => {
    setChatMessages((messages) => messages.map((message) =>
      message.id === id ? { ...message, ...patch } : message,
    ));
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
    const activeChatRun = activeChatRunRef.current;
    if (activeChatRun !== null) {
      updateChatMessage(activeChatRun.assistantId, {
        status: 'failed',
        text: 'I couldn’t complete that change. The current diagram is unchanged.',
      });
      activeChatRunRef.current = null;
    }
    finishRun();
  }, [finishRun, updateChatMessage]);

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
      const activeChatRun = activeChatRunRef.current;
      if (activeChatRun !== null) {
        updateChatMessage(activeChatRun.assistantId, {
          status: 'complete',
          text: activeChatRun.intent === 'update'
            ? 'Done. I updated the existing diagram on the canvas.'
            : 'Done. Your system design is on the canvas.',
        });
        activeChatRunRef.current = null;
      }
      generationRef.current += 1;
      finishRun();
    } catch {
      if (generationRef.current === mine) failRun('internal_error', LAYOUT_FAILURE_MESSAGE);
    }
  }, [failRun, finishRun, schedulePoll, updateChatMessage, updatePending]);
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
    setChatMessages([]);
    activeChatRunRef.current = null;
  }, []);

  const sendChatMessage = useCallback((text: string): void => {
    const userMessage: ChatMessage = {
      id: `chat-${chatSequenceRef.current++}`,
      role: 'user',
      text,
    };
    setRunError(null);
    const hasArchitecture = entry.draft.components.length > 0;
    const isNewDesign = startsNewDesignRequest(text)
      || (!isConversationalMessage(text) && isArchitectureDescription(text));
    const isUpdate = hasArchitecture && !isNewDesign && isArchitectureEditRequest(text);
    const isDesign = isNewDesign || isUpdate || (!hasArchitecture && !isConversationalMessage(text));
    const assistantId = `chat-${chatSequenceRef.current++}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: isDesign ? isUpdate ? 'I’m updating the current diagram…' : 'I’m designing the system…' : '',
      status: 'working',
      activity: isDesign ? 'design' : 'chat',
    };
    setChatMessages((messages) => [...messages, userMessage, assistantMessage]);
    if (isDesign) {
      const intent: RunIntent = isUpdate ? 'update' : 'create';
      activeChatRunRef.current = { assistantId, intent };
      void submit(intent === 'update' ? buildUpdatePrompt(entry.draft, text) : text);
      return;
    }

    const history: ChatTurn[] = [...chatMessages, userMessage]
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.text.slice(0, 1200) }));
    setChatBusy(true);
    void sendChat(history, hasArchitecture ? architectureContext(entry.draft) : undefined)
      .then(({ reply }) => updateChatMessage(assistantId, { text: reply, status: 'complete' }))
      .catch((cause: unknown) => updateChatMessage(assistantId, {
        text: cause instanceof ApiRequestError
          ? `I couldn’t get a reply: ${cause.message}`
          : 'I couldn’t connect to the chat service. Your diagram has not changed.',
        status: 'failed',
      }))
      .finally(() => setChatBusy(false));
  }, [chatMessages, entry.draft, submit, updateChatMessage]);

  useEffect(() => () => stopTimers(), [stopTimers]);

  return (
    <div className="app" data-theme={theme} data-fixture={entry.name}>
      <div className="workspace">
        <aside className={`app-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`} data-testid="app-sidebar">
          <Toolbar
            theme={theme}
            locked={locked}
            collapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
            onAddComponent={addComponent}
            onNew={resetDocument}
            onTheme={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            onFit={() => setOverviewNonce((value) => value + 1)}
            onDownload={() => downloadSvg(committed.layout, theme)}
            onDownloadPng={() => downloadPng(committed.layout, theme)}
            onCopy={() => navigator.clipboard.writeText(toMermaid(committed.layout))}
          />
          {!sidebarCollapsed ? (
            <section id="architecture-chat" className="chat-sidebar" aria-label="Architecture chat">
              <div className="chat-heading">
                <h1>{committed.layout.title}</h1>
                <p>{chatBusy ? 'Thinking…' : locked ? 'Working on your design' : chatMessages.length === 0 ? 'Architecture workspace' : 'Conversation'}</p>
              </div>
              <div ref={chatMessagesRef} className="chat-messages" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <div className="chat-welcome">
                    <span className="assistant-mark" aria-hidden="true">P</span>
                    <p className="chat-message chat-message-assistant">Describe a system to design. I’ll map its components and connections onto the canvas.</p>
                  </div>
                ) : (
                  chatMessages.map((message) => message.role === 'user' ? (
                    <div key={message.id} className="chat-message chat-message-user">{message.text}</div>
                  ) : (
                    <div key={message.id} className="chat-response">
                      <span className="assistant-mark" aria-hidden="true">P</span>
                      <div className="chat-message chat-message-assistant">
                        {message.text}
                        {message.status === 'working' && message.activity === 'design' ? <RunStatus run={pending} error={null} /> : null}
                        {message.status === 'working' && message.activity === 'chat' ? <span className="chat-thinking"><i aria-hidden="true" />Thinking</span> : null}
                        {message.status === 'failed' && runError !== null ? <RunStatus run={null} error={runError} /> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <PromptBox
                disabled={locked || chatBusy}
                onSubmit={sendChatMessage}
              />
            </section>
          ) : null}
        </aside>

        <main className="canvas-column" data-theme={theme}>
          <header className="canvas-header">
            <div className="canvas-header-copy">
              <span className="canvas-header-kicker">Canvas</span>
            </div>
          </header>
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
                overviewNonce={overviewNonce}
                fixtureName="canvas"
                positions={positions}
                selection={selection}
                onSelect={(kind, id) => setSelection({ kind, id })}
                onClearSelection={() => setSelection(null)}
                onPositionChange={updatePosition}
                onConnect={connectComponents}
                onDelete={deleteSelection}
                onReady={() => {}}
              />
            </ErrorBoundary>
          </div>
          <SidePanel
            entry={entry}
            selection={selection}
            onChangeComponent={updateComponent}
            onChangeConnection={updateConnection}
            onChangeGroup={updateGroup}
            onClearSelection={() => setSelection(null)}
            onDelete={() => selection !== null && deleteSelection(selection)}
          />
        </main>
      </div>
    </div>
  );
}
