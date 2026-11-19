import { useEffect, useState } from 'react';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FIXTURES, type Entry } from '../app/modes';
import { layoutArchitecture } from '../layout/layout';
import type { LayoutResult } from '../layout/layoutTypes';
import { BlockingFlagsPanel } from '../render/BlockingFlagsPanel';
import { Canvas } from '../render/Canvas';
import { SidePanel } from '../render/SidePanel';

afterEach(cleanup);

const WARNING_ENTRY: Entry = {
  ...FIXTURES.small,
  draft: {
    ...FIXTURES.small.draft,
    flags: [
      {
        id: 'flg_retention',
        kind: 'underspecified',
        description: 'The retention window is left open.',
        requirement_refs: ['req_001'],
        severity: 'warning',
      },
    ],
  },
};

function Harness({ entry, showCanvas = false }: { entry: Entry; showCanvas?: boolean }) {
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
    return <div data-testid="harness-loading" />;
  }

  return (
    <>
      <BlockingFlagsPanel flags={entry.draft.flags ?? []} />
      {showCanvas ? (
        <div style={{ position: 'relative', width: 1200, height: 600 }}>
          <Canvas
            result={result}
            issues={entry.issues.issues}
            theme="light"
            locked={false}
            focus={null}
            zoom={null}
            fitNonce={0}
            fixtureName={entry.name}
            onSelect={() => {}}
            onClearSelection={() => {}}
            onReady={() => {}}
          />
        </div>
      ) : null}
      <SidePanel
        entry={entry}
        result={result}
        selection={null}
        onSelect={() => {}}
        theme="light"
      />
    </>
  );
}

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('side-panel')).toBeTruthy());
}

function countFor(label: string): string {
  const overview = screen.getByTestId('overview-panel');
  for (const div of overview.querySelectorAll('div')) {
    if (div.querySelector('dt')?.textContent === label) {
      return div.querySelector('dd')?.textContent ?? '';
    }
  }
  throw new Error(`count not found: ${label}`);
}

describe('blocking flags', () => {
  it('shows the unresolved panel with the description and requirement refs', async () => {
    render(<Harness entry={FIXTURES.broken} />);
    await ready();

    const panel = screen.getByTestId('blocking-flags-panel');
    expect(panel.textContent).toContain('Unresolved blocking flag');
    for (const flag of FIXTURES.broken.draft.flags ?? []) {
      if (flag.severity === 'blocking') {
        expect(panel.textContent).toContain(flag.description);
        for (const ref of flag.requirement_refs ?? []) {
          expect(panel.textContent).toContain(ref);
        }
      }
    }
  });

  it('has no dismiss or collapse control and remains while the canvas renders', async () => {
    render(<Harness entry={FIXTURES.broken} showCanvas />);
    await waitFor(() => {
      expect(document.querySelector('[data-layout-ready="true"]')).not.toBeNull();
    });

    const panel = screen.getByTestId('blocking-flags-panel');
    expect(panel.querySelectorAll('button, input, select, details, summary, [role="button"]')).toHaveLength(
      0,
    );
    expect(panel.querySelectorAll('[data-testid="blocking-flag"]')).toHaveLength(1);
    expect(panel.getAttribute('aria-hidden')).toBeNull();
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(screen.getByTestId('blocking-flags-panel')).toBeTruthy();
  });

  it('does not show the panel or the unresolved label for a warning-only draft', async () => {
    render(<Harness entry={WARNING_ENTRY} />);
    await ready();

    expect(screen.queryByTestId('blocking-flags-panel')).toBeNull();
    expect(screen.queryByText('Unresolved blocking flag')).toBeNull();
    const rows = document.querySelectorAll('[data-testid="flag-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-severity')).toBe('warning');
    expect(screen.getByTestId('side-panel').textContent).toContain('The retention window is left open.');
  });

  it('matches the side-panel flag count to the payload', async () => {
    render(<Harness entry={FIXTURES.broken} />);
    await ready();

    const flags = FIXTURES.broken.draft.flags ?? [];
    expect(countFor('Flags')).toBe(String(flags.length));
    expect(document.querySelectorAll('[data-testid="flag-row"]')).toHaveLength(flags.length);
    const summary = [...document.querySelectorAll('.panel-section summary')].find((element) =>
      element.textContent?.startsWith('Flags'),
    );
    expect(summary?.textContent).toContain(String(flags.length));
  });
});
