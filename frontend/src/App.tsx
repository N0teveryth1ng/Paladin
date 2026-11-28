import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { History, MessagesSquare, Pencil, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Input, Textarea } from '../components/ui/input';
import { ApiRequestError, createRun, getRun, sendAssistant } from './api/client';
import type { ChatTurn, PatchOperation } from './api/types';
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
import { applyPatchOperations } from './app/patchDraft';
import { layoutArchitecture, type LayoutResult } from './layout/layout';
import { displayEdgeLabel } from './layout/nodeSizes';
import { Canvas } from './render/Canvas';
import { copyPngToClipboard, downloadPng, downloadSvg, downloadWorkspaceBundle, downloadWorkspaceFile, openWorkspaceFile, toMermaid } from './render/diagramExport';
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

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  draft?: ArchitectureDraft;
  positions?: Record<string, { x: number; y: number }>;
  pinned?: boolean;
}

interface DesignCheckpoint {
  id: string;
  name: string;
  createdAt: string;
  draft: ArchitectureDraft;
  positions: Record<string, { x: number; y: number }>;
}

interface WorkspaceSnapshot {
  version: 1;
  draft: ArchitectureDraft;
  positions: Record<string, { x: number; y: number }>;
  chatMessages: ChatMessage[];
  chatSessions: ChatSession[];
  activeChatId: string | null;
  checkpoints: DesignCheckpoint[];
  theme: ThemeName;
  sidebarWidth: number;
}

const WORKSPACE_KEY = 'paladin.workspace.v1';
const CHAT_CLEANUP_KEY = 'paladin.chats.cleaned.v1';
const MAX_CHAT_SESSIONS = 30;

function chatTitle(messages: ChatMessage[], fallback: string): string {
  return messages.find((m) => m.role === 'user')?.text.slice(0, 60) || fallback || 'New chat';
}

function normalizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return messages.map((message) => {
    const id = typeof message.id === 'string' && message.id && !seen.has(message.id) ? message.id : newId('chat');
    seen.add(id);
    return id === message.id ? message : { ...message, id };
  });
}

function loadWorkspaceSnapshot(): WorkspaceSnapshot | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot> & { activeChatId?: unknown };
    if (!parsed || parsed.version !== 1 || !parsed.draft) return null;
    const checkpoints = Array.isArray(parsed.checkpoints) ? parsed.checkpoints.slice(0, 30) as DesignCheckpoint[] : [];

    const cleanupDone = localStorage.getItem(CHAT_CLEANUP_KEY) === '1';
    if (!cleanupDone) {
      localStorage.setItem(CHAT_CLEANUP_KEY, '1');
      const freshId = newChatSessionId();
      const freshSession: ChatSession = { id: freshId, title: 'New chat', updatedAt: new Date().toISOString(), messages: [] };
      return {
        version: 1,
        draft: parsed.draft as ArchitectureDraft,
        positions: (parsed.positions && typeof parsed.positions === 'object') ? parsed.positions as Record<string, { x: number; y: number }> : {},
        chatMessages: [],
        chatSessions: [freshSession],
        activeChatId: freshId,
        checkpoints,
        theme: parsed.theme === 'dark' ? 'dark' : 'light',
        sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : 400,
      };
    }

    const chatMessages = normalizeChatMessages(Array.isArray(parsed.chatMessages) ? parsed.chatMessages.slice(-100) as ChatMessage[] : []);
    let chatSessions = (Array.isArray(parsed.chatSessions) ? parsed.chatSessions.slice(0, MAX_CHAT_SESSIONS) as ChatSession[] : [])
      .map((session) => ({ ...session, messages: normalizeChatMessages(Array.isArray(session.messages) ? session.messages : []) }));
    let activeChatId = typeof parsed.activeChatId === 'string' ? parsed.activeChatId : null;
    if (!activeChatId || !chatSessions.some((s) => s.id === activeChatId)) {
      const id = activeChatId ?? newChatSessionId();
      const session: ChatSession = { id, title: chatTitle(chatMessages, 'New chat'), updatedAt: new Date().toISOString(), messages: chatMessages };
      chatSessions = [session, ...chatSessions.filter((s) => s.id !== id)].slice(0, MAX_CHAT_SESSIONS);
      activeChatId = id;
    } else if (chatMessages.length > 0) {
      chatSessions = chatSessions.map((s) => s.id === activeChatId ? { ...s, messages: chatMessages, title: chatTitle(chatMessages, s.title), updatedAt: s.updatedAt } : s);
    }
    const active = chatSessions.find((s) => s.id === activeChatId);
    return {
      version: 1,
      draft: (active?.draft as ArchitectureDraft | undefined) ?? (parsed.draft as ArchitectureDraft),
      positions: (active?.positions && typeof active.positions === 'object') ? active.positions as Record<string, { x: number; y: number }> : ((parsed.positions && typeof parsed.positions === 'object') ? parsed.positions as Record<string, { x: number; y: number }> : {}),
      chatMessages: active?.messages ?? [],
      chatSessions,
      activeChatId,
      checkpoints,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : 400,
    };
  } catch {
    return null;
  }
}

function saveWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota/storage errors
  }
}

function newChatSessionId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PatchProposal {
  assistantId: string;
  reply: string;
  operations: PatchOperation[];
  summary: string[];
}

type PlanStep = 'idle' | 'classifying' | 'planning' | 'validating' | 'applying' | 'done';

const PLAN_LABELS: Record<PlanStep, string> = {
  idle: '',
  classifying: 'Classifying intent…',
  planning: 'Planning patch…',
  validating: 'Validating…',
  applying: 'Applying…',
  done: 'Done',
};

function summarizePatchOperations(ops: PatchOperation[], draft: ArchitectureDraft): string[] {
  const byId = new Map(draft.components.map((c) => [c.id, c.name]));
  const connById = new Map((draft.connections ?? []).map((c) => [c.id, c.label]));
  const grpById = new Map((draft.groups ?? []).map((g) => [g.id, g.name]));
  return ops.map((op) => {
    switch (op.op) {
      case 'set_title': return `Set title: ${op.name ?? ''}`;
      case 'set_summary': return 'Update summary';
      case 'add_component': return `+ Add component: ${String((op.component as any)?.name ?? 'component')}`;
      case 'update_component': return `~ Update component: ${byId.get(op.id ?? '') ?? op.id ?? 'component'}`;
      case 'remove_component': return `- Remove component: ${byId.get(op.id ?? '') ?? op.id ?? 'component'}`;
      case 'add_connection': {
        const c: any = op.connection ?? {};
        return `+ Add connection: ${byId.get(c.from_id ?? c.from) ?? c.from_id ?? c.from ?? '?'} → ${byId.get(c.to_id ?? c.to) ?? c.to_id ?? c.to ?? '?'} (${c.label ?? 'link'})`;
      }
      case 'update_connection': return `~ Update connection: ${connById.get(op.id ?? '') ?? op.id ?? 'connection'}`;
      case 'remove_connection': return `- Remove connection: ${connById.get(op.id ?? '') ?? op.id ?? 'connection'}`;
      case 'add_group': return `+ Add group: ${String((op.group as any)?.name ?? 'group')}`;
      case 'update_group': return `~ Update group: ${grpById.get(op.id ?? '') ?? op.id ?? 'group'}`;
      case 'remove_group': return `- Remove group: ${grpById.get(op.id ?? '') ?? op.id ?? 'group'}`;
      default: return `~ ${op.op}`;
    }
  });
}

interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

const DESIGN_TEMPLATES: DesignTemplate[] = [
  { id: 'url-shortener', name: 'URL Shortener', description: 'TinyURL-style service with redirects, analytics, and caching.', prompt: 'Design a scalable URL shortener like TinyURL. Include API, redirect service, key generation, database, cache, analytics, and CDN/edge considerations.' },
  { id: 'event-driven', name: 'Event-Driven System', description: 'Async producers, broker, consumers, and observability.', prompt: 'Design an event-driven architecture for order processing. Include producers, message broker, consumer services, dead-letter handling, storage, and monitoring.' },
  { id: 'crud', name: 'CRUD App', description: 'Classic web app with API, DB, auth, and frontend.', prompt: 'Design a classic CRUD web application with frontend, API gateway/backend service, authentication, relational database, object storage, and background jobs.' },
  { id: 'realtime-chat', name: 'Realtime Chat', description: 'WebSocket chat with presence, storage, and delivery.', prompt: 'Design a realtime chat system with web/mobile clients, websocket gateway, chat service, presence, message store, push notifications, and media storage.' },
];

const REMIX_ACTIONS: Array<{ id: string; label: string; prompt: string }> = [
  { id: 'ha', label: 'Make it highly available', prompt: 'Make this architecture highly available. Add redundancy, failover, health checks, and remove single points of failure where appropriate.' },
  { id: 'multi-region', label: 'Add multi-region', prompt: 'Evolve this architecture for multi-region deployment with replication, global routing, and region failover considerations.' },
  { id: 'security', label: 'Harden security', prompt: 'Review and improve security: add authn/authz, secrets management, WAF/rate limiting, encryption, and audit logging where appropriate.' },
  { id: 'observability', label: 'Add observability', prompt: 'Add observability components: metrics, logs, traces, alerting, and dashboards, integrated with the existing services.' },
];

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
  const initial = useMemo(() => parseMode(window.location.search, true), []);
  const [restored] = useState(loadWorkspaceSnapshot);
  const [theme, setTheme] = useState<ThemeName>(restored?.theme ?? initial.theme);
  const [selection, setSelection] = useState<Selection>(null);
  const [committed, setCommitted] = useState<Committed>(() => {
    if (!restored?.draft) return blankDocument();
    const base = blankDocument();
    return {
      ...base,
      entry: {
        ...base.entry,
        label: restored.draft.title || base.entry.label,
        draft: restored.draft,
      },
    };
  });
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [runError, setRunError] = useState<RunErrorView | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [overviewNonce, setOverviewNonce] = useState(0);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(restored?.positions ?? {});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 760);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const w = restored?.sidebarWidth;
    if (typeof w === 'number') return Math.min(560, Math.max(320, Math.round(w)));
    return 400;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(restored?.chatMessages ?? []);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(restored?.chatSessions ?? []);
  const [activeChatId, setActiveChatId] = useState<string>(() => restored?.activeChatId ?? (restored?.chatSessions?.[0]?.id ?? newChatSessionId()));
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [checkpoints, setCheckpoints] = useState<DesignCheckpoint[]>(restored?.checkpoints ?? []);
  const [pendingProposal, setPendingProposal] = useState<PatchProposal | null>(null);
  const [planStep, setPlanStep] = useState<PlanStep>('idle');
  const [chatSearch, setChatSearch] = useState('');
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importKind, setImportKind] = useState<'readme' | 'openapi' | 'terraform' | 'docker-compose' | 'repo-tree' | 'other'>('readme');

  const pendingRef = useRef<PendingRun | null>(null);
  const splitDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const runIdRef = useRef<string>('');
  const pollTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const documentRequestRef = useRef(0);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const activeChatRunRef = useRef<ActiveChatRun | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const chatMessagesStateRef = useRef<ChatMessage[]>(restored?.chatMessages ?? []);
  const sendChatMessageRef = useRef<(text: string) => void>(() => {});
  const undoStackRef = useRef<Array<{ draft: ArchitectureDraft; positions: Record<string, { x: number; y: number }> }>>([]);
  const redoStackRef = useRef<Array<{ draft: ArchitectureDraft; positions: Record<string, { x: number; y: number }> }>>([]);
  const restoredLayoutRef = useRef(false);

  const locked = pending !== null;
  const entry = committed.entry;
  chatMessagesStateRef.current = chatMessages;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container !== null) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (restoredLayoutRef.current) return;
    restoredLayoutRef.current = true;
    const draft = restored?.draft;
    if (!draft || draft.components.length === 0) return;
    const requestId = ++documentRequestRef.current;
    void layoutArchitecture(draft).then((nextLayout) => {
      if (documentRequestRef.current !== requestId) return;
      setCommitted((current) => ({ ...current, layout: nextLayout, entry: { ...current.entry, draft, label: draft.title || current.entry.label } }));
      setFitNonce((v) => v + 1);
    }).catch(() => { /* keep restored draft; layout can be retried by editing */ });
  }, [restored]);

  useEffect(() => {
    const syncedSessions = (() => {
      const exists = chatSessions.some((s) => s.id === activeChatId);
      const base = exists ? chatSessions : [{ id: activeChatId, title: chatTitle(chatMessages, 'New chat'), updatedAt: new Date().toISOString(), messages: chatMessages }, ...chatSessions];
      return base.map((s) => s.id === activeChatId
        ? { ...s, title: s.title?.trim() || chatTitle(chatMessages, 'New chat'), updatedAt: new Date().toISOString(), messages: chatMessages, draft: entry.draft, positions }
        : s).slice(0, MAX_CHAT_SESSIONS);
    })();
    const snapshot: WorkspaceSnapshot = {
      version: 1,
      draft: entry.draft,
      positions,
      chatMessages,
      chatSessions: syncedSessions,
      activeChatId,
      checkpoints,
      theme,
      sidebarWidth,
    };
    const timer = window.setTimeout(() => saveWorkspaceSnapshot(snapshot), 300);
    return () => window.clearTimeout(timer);
  }, [entry.draft, positions, chatMessages, chatSessions, activeChatId, checkpoints, theme, sidebarWidth]);

  useEffect(() => {
    setChatSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === activeChatId);
      const now = new Date().toISOString();
      if (idx < 0) return [{ id: activeChatId, title: chatTitle(chatMessages, 'New chat'), updatedAt: now, messages: chatMessages, draft: entry.draft, positions }, ...prev].slice(0, MAX_CHAT_SESSIONS);
      const cur = prev[idx];
      if (cur.messages === chatMessages && cur.draft === entry.draft && cur.positions === positions) return prev;
      const next = [...prev];
      next[idx] = { ...cur, title: cur.title?.trim() || chatTitle(chatMessages, 'New chat'), updatedAt: now, messages: chatMessages, draft: entry.draft, positions };
      return next;
    });
  }, [activeChatId, chatMessages, entry.draft, positions]);



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

  const pushHistory = useCallback((): void => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), { draft: entry.draft, positions: { ...positions } }];
    redoStackRef.current = [];
    setHistoryTick((v) => v + 1);
  }, [entry.draft, positions]);

  const commitStructure = useCallback((draft: ArchitectureDraft, select?: Selection, recordHistory = true): void => {
    if (pendingRef.current !== null) return;
    if (recordHistory) pushHistory();
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
  }, [committed.entry, positions, pushHistory]);

  const undo = useCallback((): void => {
    if (pendingRef.current !== null) return;
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push({ draft: entry.draft, positions: { ...positions } });
    setHistoryTick((v) => v + 1);
    const request = ++documentRequestRef.current;
    setLayoutError(null);
    void layoutArchitecture(prev.draft).then((layout) => {
      if (request !== documentRequestRef.current) return;
      setCommitted((current) => ({
        entry: { ...current.entry, draft: prev.draft, label: prev.draft.title, issues: { ...current.entry.issues, fixture: 'edited canvas', issues: [] } },
        layout: layoutWithPositions(layout, prev.positions),
      }));
      setPositions(prev.positions);
      setSelection(null);
      setFitNonce((v) => v + 1);
    }).catch((cause: unknown) => {
      setLayoutError(cause instanceof Error ? cause.message : 'Could not undo this change.');
    });
  }, [entry.draft, positions]);

  const redo = useCallback((): void => {
    if (pendingRef.current !== null) return;
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push({ draft: entry.draft, positions: { ...positions } });
    setHistoryTick((v) => v + 1);
    const request = ++documentRequestRef.current;
    setLayoutError(null);
    void layoutArchitecture(next.draft).then((layout) => {
      if (request !== documentRequestRef.current) return;
      setCommitted((current) => ({
        entry: { ...current.entry, draft: next.draft, label: next.draft.title, issues: { ...current.entry.issues, fixture: 'edited canvas', issues: [] } },
        layout: layoutWithPositions(layout, next.positions),
      }));
      setPositions(next.positions);
      setSelection(null);
      setFitNonce((v) => v + 1);
    }).catch((cause: unknown) => {
      setLayoutError(cause instanceof Error ? cause.message : 'Could not redo this change.');
    });
  }, [entry.draft, positions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

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
  const deleteMany = useCallback((targets: Array<Exclude<Selection, null>>): void => {
    if (targets.length === 0) return;
    let next = entry.draft;
    const removed = new Set<string>();
    for (const target of targets) {
      if (target.kind === 'component') {
        removed.add(target.id);
        next = {
          ...next,
          components: next.components.filter((item) => item.id !== target.id),
          connections: (next.connections ?? []).filter((item) => item.from !== target.id && item.to !== target.id),
          groups: (next.groups ?? []).map((g) => ({ ...g, members: g.members.filter((id) => id !== target.id) })),
        };
      } else if (target.kind === 'edge') {
        next = { ...next, connections: (next.connections ?? []).filter((item) => item.id !== target.id) };
      } else {
        next = { ...next, groups: (next.groups ?? []).filter((item) => item.id !== target.id).map((g) => g.parent_id === target.id ? { ...g, parent_id: null } : g) };
      }
    }
    next = { ...next, groups: (next.groups ?? []).filter((g) => g.members.length > 0) };
    if (removed.size > 0) setPositions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))));
    setSelection(null);
    commitStructure(next);
  }, [commitStructure, entry.draft]);

  const reconnectEdge = useCallback((edgeId: string, source: string, target: string): void => {
    if (source === target) return;
    const draft = entry.draft;
    const next = { ...draft, connections: (draft.connections ?? []).map((c) => c.id === edgeId ? { ...c, from: source, to: target } : c) };
    commitStructure(next, { kind: 'edge', id: edgeId });
  }, [commitStructure, entry.draft]);

  const duplicateSelected = useCallback((ids: string[]): void => {
    if (ids.length === 0) return;
    const draft = entry.draft;
    const idMap = new Map<string, string>();
    const components = [...draft.components];
    const used = new Set([...components.map((c) => c.id), ...(draft.connections ?? []).map((c) => c.id), ...(draft.groups ?? []).map((g) => g.id)]);
    const takeId = (prefix: string) => { let i = 1; let id = `${prefix}_${i}`; while (used.has(id)) id = `${prefix}_${++i}`; used.add(id); return id; };
    const newPositions = { ...positions };
    for (const id of ids) {
      const src = components.find((c) => c.id === id);
      if (!src) continue;
      const nid = takeId('cmp');
      idMap.set(id, nid);
      components.push({ ...src, id: nid, name: `${src.name} copy` });
      const p = positions[id] ?? committed.layout.nodes.find((n) => n.id === id);
      const base = p ? { x: (p as any).x ?? 0, y: (p as any).y ?? 0 } : { x: 0, y: 0 };
      newPositions[nid] = { x: base.x + 40, y: base.y + 40 };
    }
    const connections = [...(draft.connections ?? [])];
    for (const c of draft.connections ?? []) {
      if (idMap.has(c.from) && idMap.has(c.to)) {
        const nid = takeId('cnx');
        connections.push({ ...c, id: nid, from: idMap.get(c.from)!, to: idMap.get(c.to)! });
      }
    }
    setPositions(newPositions);
    commitStructure({ ...draft, components, connections }, idMap.size === 1 ? { kind: 'component', id: [...idMap.values()][0] } : undefined);
  }, [commitStructure, entry.draft, positions, committed.layout.nodes]);

  const alignSelected = useCallback((mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h' | 'distribute-v', ids: string[]): void => {
    const nodes = ids.map((id) => {
      const n = committed.layout.nodes.find((x) => x.id === id && x.kind === 'component');
      const pos = positions[id];
      if (!n) return null;
      return { id, x: pos?.x ?? n.x, y: pos?.y ?? n.y, w: n.width, h: n.height };
    }).filter(Boolean) as Array<{ id: string; x: number; y: number; w: number; h: number }>;
    if (nodes.length < 2) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + n.h));
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
    const next = { ...positions };
    if (mode === 'left') nodes.forEach((n) => { next[n.id] = { x: minX, y: n.y }; });
    else if (mode === 'right') nodes.forEach((n) => { next[n.id] = { x: maxX - n.w, y: n.y }; });
    else if (mode === 'center') nodes.forEach((n) => { next[n.id] = { x: cx - n.w / 2, y: n.y }; });
    else if (mode === 'top') nodes.forEach((n) => { next[n.id] = { x: n.x, y: minY }; });
    else if (mode === 'bottom') nodes.forEach((n) => { next[n.id] = { x: n.x, y: maxY - n.h }; });
    else if (mode === 'middle') nodes.forEach((n) => { next[n.id] = { x: n.x, y: cy - n.h / 2 }; });
    else if (mode === 'distribute-h') {
      const sorted = [...nodes].sort((a, b) => a.x - b.x);
      const totalW = sorted.reduce((s, n) => s + n.w, 0);
      const gap = sorted.length > 1 ? (maxX - minX - totalW) / (sorted.length - 1) : 0;
      let x = minX;
      sorted.forEach((n) => { next[n.id] = { x, y: n.y }; x += n.w + gap; });
    } else if (mode === 'distribute-v') {
      const sorted = [...nodes].sort((a, b) => a.y - b.y);
      const totalH = sorted.reduce((s, n) => s + n.h, 0);
      const gap = sorted.length > 1 ? (maxY - minY - totalH) / (sorted.length - 1) : 0;
      let y = minY;
      sorted.forEach((n) => { next[n.id] = { x: n.x, y }; y += n.h + gap; });
    }
    setPositions(next);
  }, [committed.layout.nodes, positions]);

  const updatePosition = useCallback((id: string, position: { x: number; y: number }): void => {
    setPositions((current) => ({ ...current, [id]: position }));
  }, []);

  const startSidebarResize = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    if (sidebarCollapsed) return;
    splitDragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [sidebarCollapsed, sidebarWidth]);

  const onSidebarResize = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const drag = splitDragRef.current;
    if (!drag) return;
    const next = Math.min(Math.min(560, Math.round(window.innerWidth * 0.72)), Math.max(320, drag.startWidth + (event.clientX - drag.startX)));
    setSidebarWidth(next);
  }, []);

  const endSidebarResize = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    if (!splitDragRef.current) return;
    splitDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const persistActiveChat = useCallback((msgs: ChatMessage[] = chatMessagesStateRef.current) => {
    setChatSessions((prev) => {
      const exists = prev.some((s) => s.id === activeChatId);
      const base = exists ? prev : [{ id: activeChatId, title: 'New chat', updatedAt: new Date().toISOString(), messages: [], draft: entry.draft, positions }, ...prev];
      return base.map((s) => s.id === activeChatId
        ? { ...s, title: s.title?.trim() || chatTitle(msgs, 'New chat'), updatedAt: new Date().toISOString(), messages: msgs, draft: entry.draft, positions }
        : s).slice(0, MAX_CHAT_SESSIONS);
    });
  }, [activeChatId, entry.draft, positions]);

  const startNewChat = useCallback((): void => {
    const msgs = chatMessagesStateRef.current;
    persistActiveChat(msgs);
    const id = newChatSessionId();
    const session: ChatSession = { id, title: 'New chat', updatedAt: new Date().toISOString(), messages: [], draft: entry.draft, positions };
    setChatSessions((prev) => [session, ...prev.filter((s) => s.id !== id)].slice(0, MAX_CHAT_SESSIONS));
    setActiveChatId(id);
    setChatMessages([]);
    setChatHistoryOpen(false);
    setPendingProposal(null);
    setPlanStep('idle');
    activeChatRunRef.current = null;
  }, [persistActiveChat, entry.draft, positions]);

  const switchToChat = useCallback((id: string): void => {
    if (id === activeChatId) { setChatHistoryOpen(false); return; }
    const msgs = chatMessagesStateRef.current;
    const curDraft = entry.draft;
    const curPositions = positions;
    setChatSessions((prev) => {
      const exists = prev.some((s) => s.id === activeChatId);
      const base = exists ? prev : [{ id: activeChatId, title: 'New chat', updatedAt: new Date().toISOString(), messages: [], draft: curDraft, positions: curPositions }, ...prev];
      const synced = base.map((s) => s.id === activeChatId
        ? { ...s, title: s.title?.trim() || chatTitle(msgs, 'New chat'), updatedAt: new Date().toISOString(), messages: msgs, draft: curDraft, positions: curPositions }
        : s);
      const target = synced.find((s) => s.id === id);
      if (target) {
        setChatMessages(target.messages);
        if (target.draft) {
          const requestId = ++documentRequestRef.current;
          setPositions(target.positions ?? {});
          void layoutArchitecture(target.draft).then((nextLayout) => {
            if (documentRequestRef.current !== requestId) return;
            setCommitted((current) => ({ ...current, layout: nextLayout, entry: { ...current.entry, draft: target.draft as ArchitectureDraft, label: (target.draft as ArchitectureDraft).title || current.entry.label } }));
            setFitNonce((v) => v + 1);
          }).catch(() => { /* ignore */ });
        }
      }
      return synced.slice(0, MAX_CHAT_SESSIONS);
    });
    setActiveChatId(id);
    setChatHistoryOpen(false);
    setPendingProposal(null);
    setPlanStep('idle');
    activeChatRunRef.current = null;
  }, [activeChatId, entry.draft, positions]);

  const renameChat = useCallback((id: string, title: string) => {
    const next = title.trim().slice(0, 80);
    if (!next) return;
    setChatSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: next, updatedAt: new Date().toISOString() } : s));
  }, []);

  const togglePinChat = useCallback((id: string) => {
    setChatSessions((prev) => prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s));
  }, []);

  const deleteChat = useCallback((id: string): void => {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    setChatSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (id === activeChatId) {
        const next = remaining[0] ?? { id: newChatSessionId(), title: 'New chat', updatedAt: new Date().toISOString(), messages: [], draft: entry.draft, positions };
        const nextList = remaining.some((s) => s.id === next.id) ? remaining : [next, ...remaining];
        setActiveChatId(next.id);
        setChatMessages(next.messages);
        if (next.draft) {
          const requestId = ++documentRequestRef.current;
          setPositions(next.positions ?? {});
          void layoutArchitecture(next.draft).then((nextLayout) => {
            if (documentRequestRef.current !== requestId) return;
            setCommitted((current) => ({ ...current, layout: nextLayout, entry: { ...current.entry, draft: next.draft as ArchitectureDraft, label: (next.draft as ArchitectureDraft).title || current.entry.label } }));
            setFitNonce((v) => v + 1);
          }).catch(() => {});
        }
        setPendingProposal(null);
        setPlanStep('idle');
        activeChatRunRef.current = null;
        return nextList.slice(0, MAX_CHAT_SESSIONS);
      }
      return remaining;
    });
  }, [activeChatId, entry.draft, positions]);

  const resetDocument = useCallback((): void => {
    startNewChat();
    documentRequestRef.current += 1;
    generationRef.current += 1;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryTick((v) => v + 1);
    setCommitted(blankDocument());
    setPositions({});
    setSelection(null);
    setRunError(null);
    setLayoutError(null);
    setFitNonce((value) => value + 1);
  }, [startNewChat]);

  const openDocument = useCallback(async (): Promise<void> => {
    const file = await openWorkspaceFile();
    if (!file || !file.draft || typeof file.draft !== 'object') return;
    startNewChat();
    const draft = file.draft as ArchitectureDraft;
    const nextPositions = (file.positions && typeof file.positions === 'object') ? file.positions : {};
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryTick((v) => v + 1);
    const request = ++documentRequestRef.current;
    setLayoutError(null);
    void layoutArchitecture(draft).then((layout) => {
      if (request !== documentRequestRef.current) return;
      setCommitted({
        entry: {
          name: 'live',
          label: draft.title || file.name || 'Loaded design',
          file: 'canvas',
          draft,
          issues: { fixture: 'canvas', rules_version: '1.1', issues: [] },
        },
        layout: layoutWithPositions(layout, nextPositions),
      });
      setPositions(nextPositions);
      setSelection(null);
      setFitNonce((v) => v + 1);
    }).catch((cause: unknown) => {
      setLayoutError(cause instanceof Error ? cause.message : 'Could not load this file.');
    });
  }, [startNewChat]);

  const createCheckpoint = useCallback(() => {
    const name = window.prompt('Checkpoint name:', `Checkpoint ${checkpoints.length + 1}`);
    if (name === null) return;
    const cp: DesignCheckpoint = { id: newId('ckpt'), name: name.trim() || `Checkpoint ${checkpoints.length + 1}`, createdAt: new Date().toISOString(), draft: entry.draft, positions };
    setCheckpoints((prev) => [cp, ...prev].slice(0, 30));
  }, [checkpoints.length, entry.draft, positions]);

  const restoreCheckpoint = useCallback((id: string) => {
    const cp = checkpoints.find((c) => c.id === id);
    if (!cp) return;
    pushHistory();
    const requestId = ++documentRequestRef.current;
    setPositions(cp.positions ?? {});
    void layoutArchitecture(cp.draft).then((nextLayout) => {
      if (documentRequestRef.current !== requestId) return;
      setCommitted((current) => ({ ...current, layout: nextLayout, entry: { ...current.entry, draft: cp.draft, label: cp.draft.title || current.entry.label } }));
      setFitNonce((v) => v + 1);
      setHistoryOpen(false);
    }).catch(() => {});
  }, [checkpoints, pushHistory]);

  const deleteCheckpoint = useCallback((id: string) => {
    if (!window.confirm('Delete this checkpoint?')) return;
    setCheckpoints((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const applyTemplatePrompt = useCallback((prompt: string) => {
    setTemplatesOpen(false);
    sendChatMessageRef.current(prompt);
  }, []);

  const runImportSource = useCallback(() => {
    const text = importText.trim();
    if (!text) return;
    const kindLabel = { readme: 'README', openapi: 'OpenAPI spec', terraform: 'Terraform', 'docker-compose': 'docker-compose', 'repo-tree': 'repository tree', other: 'source' }[importKind];
    const prompt = `Generate an editable architecture diagram from this ${kindLabel}. Infer components, connections, groups, and technologies where clear. Keep it grounded in the source; mark assumptions when needed.\n\nSOURCE:\n${text.slice(0, 12000)}`;
    setImportOpen(false);
    setImportText('');
    sendChatMessageRef.current(prompt);
  }, [importText, importKind]);

  const runReview = useCallback(() => {
    if (entry.draft.components.length === 0) {
      setRunError({ code: 'internal_error', message: 'Add or generate an architecture first, then run review.' });
      return;
    }
    const prompt = 'Review this architecture for single points of failure, scaling risks, missing components, security gaps, and operational concerns. Be specific and grounded in the current diagram. Suggest actionable improvements as patch-style changes I can accept.';
    sendChatMessageRef.current(prompt);
  }, [entry.draft.components.length]);

  const acceptProposal = useCallback(() => {
    if (!pendingProposal) return;
    const { assistantId, operations, reply } = pendingProposal;
    setPlanStep('validating');
    try {
      const nextDraft = applyPatchOperations(entry.draft, operations);
      setPlanStep('applying');
      commitStructure(nextDraft);
      setSelection(null);
      updateChatMessage(assistantId, { text: reply || 'Applied the update to the current diagram.', status: 'complete', activity: 'chat' });
      setPlanStep('done');
      window.setTimeout(() => setPlanStep('idle'), 1200);
    } catch {
      updateChatMessage(assistantId, { text: 'Applying this edit safely failed. Your diagram was not changed.', status: 'failed', activity: 'chat' });
      setPlanStep('idle');
    }
    setPendingProposal(null);
  }, [pendingProposal, entry.draft, commitStructure, updateChatMessage]);

  const rejectProposal = useCallback(() => {
    if (!pendingProposal) return;
    updateChatMessage(pendingProposal.assistantId, { text: `${pendingProposal.reply}\n\n(Edit proposal rejected - diagram unchanged.)`, status: 'complete', activity: 'chat' });
    setPendingProposal(null);
    setPlanStep('idle');
  }, [pendingProposal, updateChatMessage]);

  const sendChatMessage = useCallback((text: string): void => {
    const userMessage: ChatMessage = {
      id: newId('chat'),
      role: 'user',
      text,
    };
    setRunError(null);
    setPendingProposal(null);
    const hasArchitecture = entry.draft.components.length > 0;
    const assistantId = newId('chat');
    setChatMessages((messages) => [...messages, userMessage, {
      id: assistantId,
      role: 'assistant',
      text: '',
      status: 'working',
      activity: 'chat',
    }]);

    const history: ChatTurn[] = [...chatMessages, userMessage]
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.text.slice(0, 1200) }));

    setChatBusy(true);
    setPlanStep('classifying');
    void sendAssistant({
      message: text,
      messages: history,
      current_architecture: hasArchitecture ? entry.draft : null,
      selected_id: selection?.id ?? null,
      selected_kind: selection?.kind === 'edge' ? 'connection' : (selection?.kind ?? null),
    })
      .then((response) => {
        setPlanStep('planning');
        if ((response.kind === 'small_edit' || response.kind === 'review') && response.operations.length > 0 && hasArchitecture) {
          const summary = summarizePatchOperations(response.operations, entry.draft);
          setPendingProposal({ assistantId, reply: response.reply || 'Proposed update to the current diagram.', operations: response.operations, summary });
          updateChatMessage(assistantId, {
            text: response.reply || 'I have a proposed update to the current diagram.',
            status: 'complete',
            activity: 'chat',
          });
          setPlanStep('validating');
          return;
        }

        if (response.kind === 'major_redesign') {
          const intent: RunIntent = hasArchitecture ? 'update' : 'create';
          const prompt = response.redesign_prompt?.trim() || text;
          updateChatMessage(assistantId, {
            text: response.reply || (hasArchitecture ? 'I\'m redesigning the current diagram.' : 'I\'m designing the system.'),
            status: 'working',
            activity: 'design',
          });
          activeChatRunRef.current = { assistantId, intent };
          setPlanStep('applying');
          void submit(intent === 'update' ? buildUpdatePrompt(entry.draft, prompt) : prompt);
          return;
        }

        updateChatMessage(assistantId, {
          text: response.reply || 'I can help with that.',
          status: 'complete',
          activity: 'chat',
        });
        setPlanStep('done');
        window.setTimeout(() => setPlanStep('idle'), 800);
      })
      .catch((cause: unknown) => {
        updateChatMessage(assistantId, {
          text: cause instanceof ApiRequestError
            ? `I couldn't get a reply: ${cause.message}`
            : `I couldn't connect to the assistant. Your diagram was not changed.`,
          status: 'failed',
          activity: 'chat',
        });
        setPlanStep('idle');
      })
      .finally(() => setChatBusy(false));
  }, [chatMessages, entry.draft, selection, submit, updateChatMessage]);
  sendChatMessageRef.current = sendChatMessage;

  useEffect(() => () => stopTimers(), [stopTimers]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[var(--paladin-canvas)] font-sans text-zinc-100 antialiased before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[520px] before:bg-[radial-gradient(ellipse_at_50%_0%,rgba(79,70,229,0.28),rgba(124,58,237,0.10)_38%,transparent_72%)]"
      data-theme={theme}
      data-fixture={entry.name}
      style={{ '--paladin-sidebar-width': sidebarCollapsed ? '3.5rem' : `${sidebarWidth}px` } as CSSProperties}
    >
      <div className="relative h-full w-full pl-[calc(var(--paladin-sidebar-width)+2rem)] pt-[4.5rem]">
        <Toolbar
          theme={theme}
          locked={locked}
          collapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
          onNew={resetDocument}
          onOpen={() => void openDocument()}
          onUndo={undo}
          onRedo={redo}
          canUndo={historyTick >= 0 && undoStackRef.current.length > 0}
          canRedo={historyTick >= 0 && redoStackRef.current.length > 0}
          onTheme={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
          onFit={() => setOverviewNonce((value) => value + 1)}
          onDownload={() => downloadSvg(committed.layout, theme)}
          onDownloadPng={() => downloadPng(committed.layout, theme)}
          onDownloadBundle={() => void downloadWorkspaceBundle(committed.layout, theme, entry.draft, positions, committed.layout.title?.trim() || 'paladin-design')}
          onSave={() => {
            const suggested = committed.layout.title?.trim() || 'paladin-design';
            const name = window.prompt('Save file as (local):', suggested);
            if (name === null) return;
            const trimmed = name.trim() || suggested;
            downloadWorkspaceFile(entry.draft, positions, trimmed);
          }}
          onCopy={() => navigator.clipboard.writeText(toMermaid(committed.layout))}
          onCopyImage={() => { void copyPngToClipboard(committed.layout, theme); }}
          onCheckpoint={createCheckpoint}
          onHistory={() => setHistoryOpen((v) => !v)}
          onTemplates={() => setTemplatesOpen(true)}
          onImportSource={() => setImportOpen(true)}
          onReview={runReview}
        />
        <aside
          className="fixed bottom-4 left-4 top-4 z-40 flex w-[var(--paladin-sidebar-width)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--paladin-frost)] shadow-2xl backdrop-blur-2xl"
          data-testid="app-sidebar"
        >
          {!sidebarCollapsed ? (
            <section id="architecture-chat" className="chat-sidebar flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Architecture chat">
              <div className="shrink-0 border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="m-0 truncate text-[15px] font-semibold tracking-tight text-zinc-100">{committed.layout.title}</h1>
                    <p className="m-0 mt-1 text-[11px] leading-relaxed text-zinc-500">
                      {chatBusy ? 'Thinking…' : locked ? 'Working on your design' : chatMessages.length === 0 ? 'Architecture workspace' : 'Conversation'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button type="button" variant="ghost" size="xs" onClick={startNewChat} disabled={chatBusy || locked} title="New chat" className="gap-1">
                      <Plus className="h-3 w-3" aria-hidden="true" /> New chat
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={() => setChatHistoryOpen((v) => !v)} title="Chat history" className="gap-1">
                      <MessagesSquare className="h-3 w-3" aria-hidden="true" /> Chats
                    </Button>
                  </div>
                </div>
              </div>

              {chatHistoryOpen ? (
                <div className="chat-scrollbar chat-history mx-3 mb-2 max-h-52 overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.02] p-2" aria-label="Chat history">
                  <div className="chat-history-header mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-zinc-200">
                    <strong>Chats</strong>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setChatHistoryOpen(false)} aria-label="Close chat history">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="chat-history-tools mb-2">
                    <Input className="chat-history-search h-8 text-[11px]" placeholder="Search chats..." value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} />
                  </div>
                  <div className="chat-history-list flex flex-col gap-1.5">
                    {[...chatSessions]
                      .filter((s) => !chatSearch.trim() || (s.title || '').toLowerCase().includes(chatSearch.toLowerCase()) || s.messages.some((m) => m.text.toLowerCase().includes(chatSearch.toLowerCase())))
                      .sort((a, b) => (Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))) || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
                      .map((session) => (
                        <div
                          key={session.id}
                          className={`chat-history-item flex items-stretch gap-1.5 rounded-xl border p-1.5 transition-colors ${session.id === activeChatId ? 'is-active border-indigo-400/40 bg-indigo-400/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}
                        >
                          {renamingChatId === session.id ? (
                            <div className="chat-history-rename flex w-full gap-1 p-0.5">
                              <Input
                                className="h-7 min-w-0 flex-1 text-[11px]"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { renameChat(session.id, renameValue); setRenamingChatId(null); }
                                  if (e.key === 'Escape') setRenamingChatId(null);
                                }}
                                autoFocus
                              />
                              <Button type="button" variant="secondary" size="xs" className="chat-history-small" onClick={() => { renameChat(session.id, renameValue); setRenamingChatId(null); }}>
                                Save
                              </Button>
                            </div>
                          ) : (
                            <>
                              <button type="button" className="chat-history-select flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/[0.04]" onClick={() => switchToChat(session.id)}>
                                <span className="chat-history-title flex min-w-0 items-center gap-1 truncate text-[12px] font-medium text-zinc-200">
                                  {session.pinned ? <span className="chat-pin text-amber-300">★</span> : null}
                                  {session.id === activeChatId ? <span className="text-indigo-300">•</span> : null}
                                  <span className="truncate">{session.title || 'New chat'}</span>
                                </span>
                                <span className="chat-history-date text-[10px] text-zinc-600">
                                  {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : ''}{session.draft ? ' · design attached' : ''}
                                </span>
                              </button>
                              <div className="chat-history-actions flex shrink-0 items-center gap-1">
                                <Button type="button" variant="ghost" size="xs" className="chat-history-small h-6 px-1.5 text-[10px]" title="Pin/unpin" onClick={(e) => { e.stopPropagation(); togglePinChat(session.id); }}>
                                  {session.pinned ? <Star className="h-3 w-3 fill-amber-300 text-amber-300" /> : <Star className="h-3 w-3" />}
                                </Button>
                                <Button type="button" variant="ghost" size="xs" className="chat-history-small h-6 px-1.5 text-[10px]" title="Rename" onClick={(e) => { e.stopPropagation(); setRenamingChatId(session.id); setRenameValue(session.title || ''); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="xs" className="chat-history-delete h-6 px-1.5 text-[10px] text-red-300/70 hover:text-red-300" title="Delete chat" aria-label="Delete chat" onClick={(e) => { e.stopPropagation(); deleteChat(session.id); }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div ref={chatMessagesRef} className="chat-scrollbar chat-messages flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-6" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <div className="chat-welcome flex items-start gap-3">
                    <span className="assistant-mark grid h-7 w-7 shrink-0 place-items-center rounded-full border border-indigo-300/30 bg-indigo-500/15 text-[11px] font-bold text-indigo-200" aria-hidden="true">P</span>
                    <p className="chat-message chat-message-assistant m-0 max-w-[94%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-[13px] leading-relaxed text-zinc-200">
                      Describe a system to design. I’ll map its components and connections onto the canvas.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((message) => message.role === 'user' ? (
                    <div key={message.id} className="chat-message chat-message-user ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-zinc-800/80 px-4 py-3 text-[13px] leading-relaxed text-zinc-100">
                      {message.text}
                    </div>
                  ) : (
                    <div key={message.id} className="chat-response flex items-start gap-3">
                      <span className="assistant-mark grid h-7 w-7 shrink-0 place-items-center rounded-full border border-indigo-300/30 bg-indigo-500/15 text-[11px] font-bold text-indigo-200" aria-hidden="true">P</span>
                      <div className="chat-message chat-message-assistant mr-auto max-w-[94%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-[13px] leading-relaxed text-zinc-200">
                        {message.text}
                        {message.status === 'working' && message.activity === 'design' ? <RunStatus run={pending} error={null} /> : null}
                        {message.status === 'working' && message.activity === 'chat' ? (
                          <span className="chat-thinking mt-2 inline-flex items-center gap-2 text-[11px] text-zinc-500">
                            <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300" aria-hidden="true" />
                            {planStep !== 'idle' && planStep !== 'done' ? PLAN_LABELS[planStep] : 'Thinking'}
                          </span>
                        ) : null}
                        {message.status === 'failed' && runError !== null ? <RunStatus run={null} error={runError} /> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {pendingProposal ? (
                <div className="patch-proposal mx-3 mb-2 rounded-xl border border-indigo-400/25 bg-indigo-400/[0.07] p-3.5 text-[12px] text-zinc-100" role="region" aria-label="Proposed diagram edit">
                  <div className="patch-proposal-head mb-2 flex items-center justify-between gap-2">
                    <strong className="font-semibold text-zinc-100">Proposed edit</strong>
                    <span className="text-[10px] text-zinc-500">Review before applying</span>
                  </div>
                  <ul className="chat-scrollbar patch-proposal-list mb-2 max-h-36 overflow-auto pl-4 text-[12px] leading-relaxed text-zinc-300">
                    {pendingProposal.summary.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                  <div className="patch-proposal-actions flex gap-2">
                    <Button type="button" variant="default" size="xs" onClick={acceptProposal}>Accept</Button>
                    <Button type="button" variant="ghost" size="xs" onClick={rejectProposal}>Reject</Button>
                  </div>
                </div>
              ) : null}
              {planStep !== 'idle' && planStep !== 'done' && !pendingProposal ? (
                <div className="plan-status mx-3 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] text-zinc-400" aria-live="polite">
                  {PLAN_LABELS[planStep]}
                </div>
              ) : null}
              <PromptBox disabled={locked || chatBusy} onSubmit={sendChatMessage} />
            </section>
          ) : null}
        </aside>

        {!sidebarCollapsed ? (
          <div
            className="absolute bottom-4 left-[calc(var(--paladin-sidebar-width)+0.75rem)] top-4 z-20 w-1 cursor-col-resize rounded-full bg-white/[0.06] transition-colors hover:bg-indigo-400/50"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat and canvas"
            onPointerDown={startSidebarResize}
            onPointerMove={onSidebarResize}
            onPointerUp={endSidebarResize}
            onPointerCancel={endSidebarResize}
          />
        ) : null}

        <main className="canvas-column relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/80 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)]" data-theme={theme}>
          <header className="canvas-header flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] bg-white/[0.02] px-5">
            <div className="canvas-header-copy flex min-w-0 items-baseline gap-2.5">
              <span className="canvas-header-kicker text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Canvas</span>
              <span className="truncate text-[13px] font-medium text-zinc-200">{committed.layout.title}</span>
            </div>
            <span className="flex items-center gap-2 text-[10px] text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
              Local workspace
            </span>
          </header>
          <div className="canvas-stage relative min-h-0 flex-1">
            {layoutError !== null ? (
              <div className="canvas-toast absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200 shadow-xl backdrop-blur-xl" role="alert">
                {layoutError}
              </div>
            ) : null}
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
                onReconnect={reconnectEdge}
                onDelete={deleteSelection}
                onDeleteMany={deleteMany}
                onDuplicate={duplicateSelected}
                onAlign={alignSelected}
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

      {templatesOpen ? (
        <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Templates and remix" onClick={() => setTemplatesOpen(false)}>
          <div className="modal-panel max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold text-zinc-100">Templates &amp; Remix</h2>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setTemplatesOpen(false)} aria-label="Close templates"><X className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="m-0 text-[12px] text-zinc-500">Start from a template or remix the current design.</p>
            <div className="modal-grid mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {DESIGN_TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="modal-card rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left transition-colors hover:border-indigo-400/35 hover:bg-indigo-400/[0.07]" onClick={() => applyTemplatePrompt(t.prompt)}>
                  <h3 className="m-0 text-[13px] font-semibold text-zinc-100">{t.name}</h3>
                  <p className="mt-1 m-0 text-[11px] leading-relaxed text-zinc-500">{t.description}</p>
                </button>
              ))}
            </div>
            <h3 className="mb-2 mt-5 text-[13px] font-semibold text-zinc-200">Remix current design</h3>
            <div className="modal-grid grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {REMIX_ACTIONS.map((r) => (
                <button key={r.id} type="button" className="modal-card rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left transition-colors hover:border-indigo-400/35 hover:bg-indigo-400/[0.07] disabled:opacity-40" onClick={() => applyTemplatePrompt(r.prompt)} disabled={entry.draft.components.length === 0}>
                  <h3 className="m-0 text-[13px] font-semibold text-zinc-100">{r.label}</h3>
                  <p className="mt-1 m-0 text-[11px] leading-relaxed text-zinc-500">Apply as an AI-assisted design update.</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Import source" onClick={() => setImportOpen(false)}>
          <div className="modal-panel max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold text-zinc-100">Generate from source</h2>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setImportOpen(false)} aria-label="Close import"><X className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="m-0 text-[12px] text-zinc-500">Paste README, OpenAPI, Terraform, docker-compose, or a repo tree. Paladin will generate an editable typed diagram.</p>
            <div className="mb-3 mt-4 flex gap-2">
              <select className="modal-select h-9 rounded-xl border border-white/10 bg-zinc-900/60 px-3 text-xs text-zinc-100 outline-none focus-visible:border-indigo-400/50" value={importKind} onChange={(e) => setImportKind(e.target.value as any)}>
                <option value="readme">README</option>
                <option value="openapi">OpenAPI</option>
                <option value="terraform">Terraform</option>
                <option value="docker-compose">docker-compose</option>
                <option value="repo-tree">Repo tree</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Textarea className="modal-textarea min-h-48 font-mono text-[12px]" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste source here..." />
            <div className="modal-actions mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="default" onClick={runImportSource} disabled={!importText.trim()} className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Generate diagram</Button>
              <Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Version history" onClick={() => setHistoryOpen(false)}>
          <div className="modal-panel max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-zinc-100"><History className="h-4 w-4 text-indigo-300" /> Version history / checkpoints</h2>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="m-0 text-[12px] text-zinc-500">Local checkpoints for the current design. Restore creates an undo point.</p>
            <div className="modal-actions mb-3 mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={createCheckpoint}>Save checkpoint</Button>
            </div>
            <div className="modal-list flex flex-col gap-2">
              {checkpoints.length === 0 ? (
                <div className="text-[12px] text-zinc-600">No checkpoints yet.</div>
              ) : checkpoints.map((cp) => (
                <div key={cp.id} className="modal-list-item flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-[12px] font-medium text-zinc-100">{cp.name}</strong>
                    <small className="mt-0.5 block text-[10px] text-zinc-600">{new Date(cp.createdAt).toLocaleString()} · {cp.draft.components.length} components</small>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button type="button" variant="ghost" size="xs" onClick={() => restoreCheckpoint(cp.id)}>Restore</Button>
                    <Button type="button" variant="ghost" size="xs" className="text-red-300/70 hover:text-red-300" onClick={() => deleteCheckpoint(cp.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
