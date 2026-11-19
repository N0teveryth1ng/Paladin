import { useEffect, useState } from 'react';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FIXTURES, type FixtureEntry, type ThemeName } from '../app/modes';
import { layoutArchitecture } from '../layout/layout';
import type { LayoutResult } from '../layout/layoutTypes';
import { Canvas } from '../render/Canvas';
import { Toolbar } from '../render/Toolbar';

afterEach(cleanup);

function Harness({
  entry,
  locked,
}: {
  entry: FixtureEntry;
  locked: boolean;
}) {
  const [result, setResult] = useState<LayoutResult | null>(null);

  useEffect(() => {
    let alive = true;
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

  const theme: ThemeName = 'light';

  return (
    <div style={{ position: 'relative', width: 1200, height: 700 }}>
      <Toolbar
        entry={entry}
        theme={theme}
        locked={locked}
        onFixture={() => {}}
        onTheme={() => {}}
        onFit={() => {}}
      />
      <Canvas
        result={result}
        issues={entry.issues.issues}
        theme={theme}
        locked={locked}
        focus={null}
        zoom={null}
        fitNonce={0}
        fixtureName={entry.name}
        onSelect={() => {}}
        onClearSelection={() => {}}
        onReady={() => {}}
      />
    </div>
  );
}

async function renderLocked(locked: boolean): Promise<HTMLElement> {
  render(<Harness entry={FIXTURES.small} locked={locked} />);
  await waitFor(
    () => {
      expect(document.querySelector('[data-layout-ready="true"]')).not.toBeNull();
    },
    { timeout: 20000 },
  );
  return screen.getByTestId('canvas');
}

describe('canvas states', () => {
  it('enables pan and zoom by default and keeps nodes non-draggable and non-connectable', async () => {
    const canvas = await renderLocked(false);

    expect(canvas.getAttribute('data-pan')).toBe('1');
    expect(canvas.getAttribute('data-zoom-enabled')).toBe('1');
    expect(canvas.getAttribute('data-selectable')).toBe('1');
    expect(canvas.getAttribute('data-focusable')).toBe('1');
    expect(canvas.getAttribute('data-draggable')).toBe('0');
    expect(canvas.getAttribute('data-connectable')).toBe('0');
    expect(canvas.getAttribute('data-locked')).toBe('0');

    expect(canvas.querySelectorAll('.react-flow__node.draggable')).toHaveLength(0);
    expect(canvas.querySelectorAll('.react-flow__node.connectable')).toHaveLength(0);
    expect(canvas.querySelectorAll('.react-flow__node.selectable')).toHaveLength(
      FIXTURES.small.draft.components.length + (FIXTURES.small.draft.groups?.length ?? 0),
    );

    expect(screen.queryByTestId('lock-indicator')).toBeNull();
    expect(screen.getByTestId('fit-button')).not.toBeDisabled();
  });

  it('disables pan, zoom, selection and focus when locked and shows the lock indicator', async () => {
    const canvas = await renderLocked(true);

    expect(canvas.getAttribute('data-locked')).toBe('1');
    expect(canvas.getAttribute('data-pan')).toBe('0');
    expect(canvas.getAttribute('data-zoom-enabled')).toBe('0');
    expect(canvas.getAttribute('data-selectable')).toBe('0');
    expect(canvas.getAttribute('data-focusable')).toBe('0');
    expect(canvas.getAttribute('data-draggable')).toBe('0');
    expect(canvas.getAttribute('data-connectable')).toBe('0');

    expect(canvas.querySelectorAll('.react-flow__node.selectable')).toHaveLength(0);
    expect(canvas.querySelectorAll('.react-flow__edge.selectable')).toHaveLength(0);

    for (const node of canvas.querySelectorAll('.react-flow__node')) {
      expect(node.getAttribute('tabindex')).not.toBe('0');
    }
    for (const edge of canvas.querySelectorAll('.react-flow__edge')) {
      expect(edge.getAttribute('tabindex')).not.toBe('0');
    }

    expect(screen.getByTestId('lock-indicator').textContent).toContain(
      'Locked while the agent runs',
    );
    expect(screen.getByTestId('fit-button')).toBeDisabled();
  });

  it('renders the same node and edge counts when locked', async () => {
    const canvas = await renderLocked(true);
    expect(canvas.querySelectorAll('[data-testid="component-node"]')).toHaveLength(
      FIXTURES.small.draft.components.length,
    );
    expect(canvas.querySelectorAll('[data-testid="architecture-edge"]')).toHaveLength(
      FIXTURES.small.draft.connections?.length ?? 0,
    );
    expect(canvas.querySelectorAll('[data-testid="group-node"]')).toHaveLength(
      FIXTURES.small.draft.groups?.length ?? 0,
    );
  });

  it('does not move the viewport after a drag attempt while locked', async () => {
    const canvas = await renderLocked(true);
    const before = canvas.getAttribute('data-viewport-transform');
    expect(before).not.toBeNull();

    const pane = canvas.querySelector('.react-flow__pane');
    expect(pane).not.toBeNull();
    if (pane === null) {
      return;
    }

    fireEvent.mouseDown(pane, { clientX: 400, clientY: 300, button: 0, buttons: 1 });
    fireEvent.mouseMove(pane, { clientX: 700, clientY: 450, buttons: 1 });
    fireEvent.mouseMove(pane, { clientX: 900, clientY: 600, buttons: 1 });
    fireEvent.mouseUp(pane, { clientX: 900, clientY: 600, button: 0 });

    expect(canvas.getAttribute('data-viewport-transform')).toBe(before);
  });
});
