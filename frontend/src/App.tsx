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
import {
  FIXTURES,
  parseMode,
  prefersDark,
  type Entry,
  type FixtureName,
  type ThemeName,
} from './app/modes';
import { layoutArchitecture, type LayoutResult } from './layout/layout';
import { BlockingFlagsPanel } from './render/BlockingFlagsPanel';
import { Canvas } from './render/Canvas';
import { ErrorBoundary } from './render/ErrorBoundary';
import { PromptBox } from './render/PromptBox';
import { RunStatus } from './render/RunStatus';
import { SidePanel, type Selection } from './render/SidePanel';
import { Toolbar } from './render/Toolbar';

interface Committed {
  entry: Entry;
  layout: LayoutResult;
}

export default function App() {
  const initial = useMemo(() => parseMode(window.location.search, prefersDark()), []);
  const [fixture, setFixture] = useState<FixtureName>(initial.fixture);
  const [theme, setTheme] = useState<ThemeName>(initial.theme);
  const [selection, setSelection] = useState<Selection>(null);
  const [committed, setCommitted] = useState<Committed | null>(null);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [runError, setRunError] = useState<RunErrorView | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const pendingRef = useRef<PendingRun | null>(null);
  const runIdRef = useRef<string>('');
  const pollTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const fixtureRequestRef = useRef(0);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const locked = initial.locked || pending !== null;
  const entry: Entry = committed?.entry ?? FIXTURES[fixture];

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

  const failRun = useCallback(
    (code: RunErrorCode, message?: string): void => {
      generationRef.current += 1;
      setRunError({ code, message: message ?? errorMessage(code) });
      finishRun();
    },
    [finishRun],
  );

  const schedulePoll = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
    }
    pollTimerRef.current = window.setTimeout(() => {
      void pollRef.current();
    }, POLL_INTERVAL_MS);
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    pollTimerRef.current = null;
    const runId = runIdRef.current;
    const mine = generationRef.current;
    if (runId === '' || pendingRef.current === null) {
      return;
    }

    let response: GetRunResponse;
    try {
      response = await getRun(runId);
    } catch {
      if (generationRef.current === mine) {
        failRun('connection_lost');
      }
      return;
    }
    if (generationRef.current !== mine || pendingRef.current === null) {
      return;
    }

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

    if (response.state !== 'succeeded') {
      failRun('internal_error');
      return;
    }

    const result: unknown = response.result;
    if (!isValidRunResult(result)) {
      failRun('schema_invalid');
      return;
    }
    const payload: RunResult = result;

    let layout: LayoutResult;
    try {
      // Layout runs before the commit. A bad draft never reaches the canvas.
      layout = await layoutArchitecture(payload.draft);
    } catch {
      if (generationRef.current === mine) {
        failRun('internal_error', LAYOUT_FAILURE_MESSAGE);
      }
      return;
    }
    if (generationRef.current !== mine) {
      return;
    }

    // One state update carries the draft, the issues artifact and the layout.
    setCommitted(prepareCommit(payload, layout));
    generationRef.current += 1;
    setSelection(null);
    finishRun();
  }, [failRun, finishRun, schedulePoll, updatePending]);
  pollRef.current = poll;

  const submit = useCallback(
    async (prompt: string): Promise<void> => {
      if (pendingRef.current !== null) {
        return;
      }
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
        if (generationRef.current !== mine) {
          return;
        }
        if (cause instanceof ApiRequestError) {
          const code = normalizeErrorCode(cause.code);
          failRun(code, code === 'internal_error' ? cause.message : undefined);
        } else {
          failRun('connection_lost');
        }
        return;
      }
      if (generationRef.current !== mine) {
        return;
      }

      runIdRef.current = created.run_id;
      updatePending({
        id: created.run_id,
        state: created.state === 'queued' ? 'queued' : 'running',
        elapsedMs: 0,
        maxRunSeconds: created.max_run_seconds,
      });
      tickTimerRef.current = window.setInterval(() => {
        const current = pendingRef.current;
        if (current !== null) {
          updatePending({ ...current, elapsedMs: current.elapsedMs + ELAPSED_TICK_MS });
        }
      }, ELAPSED_TICK_MS);

      // Poll immediately once, then at the one-second interval.
      await pollRef.current();
    },
    [failRun, updatePending],
  );

  const chooseFixture = useCallback(
    (name: FixtureName): void => {
      if (pendingRef.current !== null) {
        return;
      }
      const request = fixtureRequestRef.current + 1;
      fixtureRequestRef.current = request;
      const next = FIXTURES[name];
      setFixture(name);
      setSelection(null);
      setRunError(null);
      setLayoutError(null);

      layoutArchitecture(next.draft)
        .then((layout) => {
          if (request === fixtureRequestRef.current) {
            setCommitted({ entry: next, layout });
          }
        })
        .catch((cause: unknown) => {
          if (request === fixtureRequestRef.current) {
            setLayoutError(cause instanceof Error ? cause.message : String(cause));
          }
        });
    },
    [],
  );

  useEffect(() => {
    chooseFixture(initial.fixture);
  }, [chooseFixture, initial.fixture]);

  useEffect(() => {
    return () => stopTimers();
  }, [stopTimers]);

  const onReady = useCallback(() => {
    // The canvas sets its own ready flag after the initial fit.
  }, []);

  const blockingFlags = (entry.draft.flags ?? []).filter((flag) => flag.severity === 'blocking');

  return (
    <div className="app" data-theme={theme} data-fixture={entry.name}>
      <Toolbar
        entry={entry}
        theme={theme}
        locked={locked}
        onFixture={chooseFixture}
        onTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        onFit={() => setFitNonce((value) => value + 1)}
      />

      <div className="generation-bar">
        <PromptBox disabled={pending !== null} onSubmit={(prompt) => void submit(prompt)} />
        <RunStatus run={pending} error={runError} />
      </div>

      <div className="workspace">
        <main className="canvas-column">
          <BlockingFlagsPanel flags={blockingFlags} />
          <div className="canvas-stage">
            {layoutError !== null ? (
              <div className="error-card" role="alert" data-testid="layout-error">
                <h2>Layout failed</h2>
                <p>{layoutError}</p>
              </div>
            ) : committed === null ? (
              <div className="loading" data-testid="layout-loading">
                Laying out {entry.label}…
              </div>
            ) : (
              <ErrorBoundary>
                <Canvas
                  key={entry.name}
                  result={committed.layout}
                  issues={entry.issues.issues}
                  theme={theme}
                  locked={locked}
                  focus={initial.focus}
                  zoom={initial.zoom}
                  fitNonce={fitNonce}
                  fixtureName={entry.name}
                  onSelect={(kind, id) => setSelection({ kind, id })}
                  onClearSelection={() => setSelection(null)}
                  onReady={onReady}
                />
              </ErrorBoundary>
            )}
          </div>
        </main>

        {committed !== null ? (
          <SidePanel
            entry={entry}
            result={committed.layout}
            selection={selection}
            onSelect={setSelection}
            theme={theme}
          />
        ) : null}
      </div>
    </div>
  );
}
