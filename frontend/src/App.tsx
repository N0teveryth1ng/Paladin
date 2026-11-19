import { useCallback, useEffect, useMemo, useState } from 'react';

import { FIXTURES, parseMode, prefersDark, type FixtureName, type ThemeName } from './app/modes';
import { layoutArchitecture, type LayoutResult } from './layout/layout';
import { Canvas } from './render/Canvas';
import { ErrorBoundary } from './render/ErrorBoundary';
import { SidePanel, type Selection } from './render/SidePanel';
import { Toolbar } from './render/Toolbar';

export default function App() {
  const initial = useMemo(() => parseMode(window.location.search, prefersDark()), []);
  const [fixture, setFixture] = useState<FixtureName>(initial.fixture);
  const [theme, setTheme] = useState<ThemeName>(initial.theme);
  const [selection, setSelection] = useState<Selection>(null);
  const [result, setResult] = useState<LayoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const locked = initial.locked;

  const entry = FIXTURES[fixture];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let alive = true;
    setResult(null);
    setError(null);
    setSelection(null);

    layoutArchitecture(entry.draft)
      .then((layout) => {
        if (alive) {
          setResult(layout);
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      alive = false;
    };
  }, [entry]);

  const onReady = useCallback(() => {
    // The canvas sets its own ready flag after the initial fit; this hook is
    // kept for tests and future phases.
  }, []);

  return (
    <div className="app" data-theme={theme} data-fixture={fixture}>
      <Toolbar
        entry={entry}
        theme={theme}
        locked={locked}
        onFixture={(name) => {
          setFixture(name);
          setSelection(null);
        }}
        onTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        onFit={() => setFitNonce((value) => value + 1)}
      />

      <div className="workspace">
        <main className="canvas-column">
          {error !== null ? (
            <div className="error-card" role="alert" data-testid="layout-error">
              <h2>Layout failed</h2>
              <p>{error}</p>
            </div>
          ) : result === null ? (
            <div className="loading" data-testid="layout-loading">
              Laying out {entry.label}…
            </div>
          ) : (
            <ErrorBoundary>
              <Canvas
                key={fixture}
                result={result}
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
        </main>

        {result !== null ? (
          <SidePanel
            entry={entry}
            result={result}
            selection={selection}
            onSelect={setSelection}
            theme={theme}
          />
        ) : null}
      </div>
    </div>
  );
}
