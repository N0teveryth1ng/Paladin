import { useEffect, useState } from 'react';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FIXTURES, type FixtureEntry, type ThemeName } from '../app/modes';
import { layoutArchitecture } from '../layout/layout';
import type { LayoutResult } from '../layout/layoutTypes';
import { Canvas } from '../render/Canvas';
import { SidePanel } from '../render/SidePanel';
import { Toolbar } from '../render/Toolbar';

afterEach(cleanup);

function Harness({
  entry,
  theme = 'light',
  locked = false,
  focus = null,
  zoom = null,
}: {
  entry: FixtureEntry;
  theme?: ThemeName;
  locked?: boolean;
  focus?: string | null;
  zoom?: number | null;
}) {
  const [result, setResult] = useState<LayoutResult | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setResult(null);
    layoutArchitecture(entry.draft).then((layout) => {
      if (alive) {
        setResult(layout);
      }
    });
    return () => {
      alive = false;
    };
  }, [entry]);

  if (result === null) {
    return <div data-testid="loading" />;
  }

  return (
    <div style={{ position: 'relative', width: 1200, height: 800 }}>
      <Toolbar
        entry={entry}
        theme={theme}
        locked={locked}
        onFixture={() => {}}
        onTheme={() => {}}
        onFit={() => setFitNonce((value) => value + 1)}
      />
      <div style={{ position: 'relative', width: 1200, height: 700 }}>
        <Canvas
          result={result}
          issues={entry.issues.issues}
          theme={theme}
          locked={locked}
          focus={focus}
          zoom={zoom}
          fitNonce={fitNonce}
          fixtureName={entry.name}
          onSelect={() => {}}
          onClearSelection={() => {}}
          onReady={() => {}}
        />
      </div>
      <SidePanel
        entry={entry}
        result={result}
        selection={null}
        onSelect={() => {}}
        theme={theme}
      />
    </div>
  );
}

async function waitReady(): Promise<void> {
  await waitFor(
    () => {
      expect(document.querySelector('[data-layout-ready="true"]')).not.toBeNull();
    },
    { timeout: 20000 },
  );
}

function countFor(label: string): string {
  const overview = screen.getByTestId('overview-panel');
  for (const div of overview.querySelectorAll('div')) {
    const dt = div.querySelector('dt');
    const dd = div.querySelector('dd');
    if (dt?.textContent === label) {
      return dd?.textContent ?? '';
    }
  }
  throw new Error(`overview count not found: ${label}`);
}

describe('render', () => {
  it('renders the small fixture nodes, edges and group', async () => {
    const entry = FIXTURES.small;
    render(<Harness entry={entry} />);
    await waitReady();

    expect(document.querySelectorAll('[data-testid="component-node"]')).toHaveLength(
      entry.draft.components.length,
    );
    expect(document.querySelectorAll('[data-testid="architecture-edge"]')).toHaveLength(
      entry.draft.connections?.length ?? 0,
    );
    expect(document.querySelectorAll('[data-testid="group-node"]')).toHaveLength(
      entry.draft.groups?.length ?? 0,
    );
  });

  it('renders every full-coverage component and connection with distinct edge classes', async () => {
    const entry = FIXTURES.full;
    render(<Harness entry={entry} />);
    await waitReady();

    expect(document.querySelectorAll('[data-testid="component-node"]')).toHaveLength(
      entry.draft.components.length,
    );
    expect(document.querySelectorAll('[data-testid="architecture-edge"]')).toHaveLength(
      entry.draft.connections?.length ?? 0,
    );
    expect(document.querySelectorAll('.edge-sync').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.edge-async').length).toBeGreaterThan(0);
    expect(screen.getByText(/sync · solid, filled arrow/)).toBeTruthy();
    expect(screen.getByText(/async · dashed, open arrow/)).toBeTruthy();
  });

  it('shows component technology on nodes and keeps every edge label', async () => {
    const entry = FIXTURES.full;
    render(<Harness entry={entry} />);
    await waitReady();

    for (const component of entry.draft.components) {
      const node = document.querySelector(`[data-component-id="${component.id}"]`);
      expect(node).not.toBeNull();
      expect(node?.textContent).toContain(component.technology);
    }
    expect(document.querySelectorAll('.edge-label')).toHaveLength(
      entry.draft.connections?.length ?? 0,
    );
  });

  it('marks assumed components, groups and connections', async () => {
    const entry = FIXTURES.broken;
    render(<Harness entry={entry} />);
    await waitReady();

    const assumedComponents = entry.draft.components.filter((component) => component.assumed);
    const assumedConnections = (entry.draft.connections ?? []).filter(
      (connection) => connection.assumed,
    );
    expect(assumedComponents.length).toBeGreaterThan(0);
    expect(assumedConnections.length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.component-node.assumed')).toHaveLength(
      assumedComponents.length,
    );
    expect(document.querySelectorAll('.edge-assumed')).toHaveLength(assumedConnections.length);
    expect(document.querySelectorAll('.group-node.assumed').length).toBeGreaterThan(0);
  });

  it('matches the side-panel counts to the fixture', async () => {
    const entry = FIXTURES.small;
    render(<Harness entry={entry} />);
    await waitReady();

    expect(countFor('Components')).toBe(String(entry.draft.components.length));
    expect(countFor('Connections')).toBe(String(entry.draft.connections?.length ?? 0));
    expect(countFor('Groups')).toBe(String(entry.draft.groups?.length ?? 0));
    expect(countFor('Requirements')).toBe(String(entry.draft.requirements.length));
    expect(countFor('Assumptions')).toBe(String(entry.draft.assumptions?.length ?? 0));
    expect(countFor('Flags')).toBe(String(entry.draft.flags?.length ?? 0));
    expect(screen.getByTestId('adjustments-panel').textContent).toContain('No layout adjustments');
  });

  it('shows the explicit no-issues state for both clean fixtures', async () => {
    render(<Harness entry={FIXTURES.small} />);
    await waitReady();
    expect(screen.getByTestId('issues-empty').textContent).toContain('No issues');
    cleanup();

    render(<Harness entry={FIXTURES.full} />);
    await waitReady();
    expect(screen.getByTestId('issues-empty').textContent).toContain('No issues');
  });
});
