import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { FIXTURES } from '../app/modes';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const CREATED = {
  run_id: 'run_1',
  state: 'running',
  started_at: '2026-11-19T00:00:00Z',
  max_run_seconds: 1500,
};

const RESULT = {
  draft: FIXTURES.small.draft,
  issues: [],
  rules_version: '1.1',
};

function stub(responder: (call: FetchCall) => { status: number; body: unknown }): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      const { status, body } = responder(call);
      return { ok: status < 400, status, json: async () => body } as Response;
    }),
  );
  return calls;
}

function poll(state: string, result: unknown = null, error: unknown = null): Record<string, unknown> {
  return {
    run_id: 'run_1',
    state,
    elapsed_ms: 1000,
    max_run_seconds: 1500,
    result,
    error,
  };
}

function isPost(call: FetchCall): boolean {
  return call.init?.method === 'POST';
}

function createdOr(body: Record<string, unknown>) {
  return (call: FetchCall) =>
    isPost(call) ? { status: 202, body: CREATED } : { status: 200, body };
}

async function readyCanvas(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('[data-testid="canvas"]')).not.toBeNull());
  return screen.getByTestId('canvas');
}

async function submitPrompt(): Promise<void> {
  fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'A prompt' } });
  fireEvent.click(screen.getByTestId('generate-button'));
}

describe('atomic apply', () => {
  it('does not change the committed diagram while a run is active', async () => {
    const calls = stub(createdOr(poll('running')));
    render(<App />);
    const before = await readyCanvas();
    const beforeNodes = before.querySelectorAll('[data-testid="component-node"]').length;
    const beforeIssues = screen.getByTestId('issues-panel').textContent;

    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('lock-indicator')).toBeTruthy());
    await waitFor(
      () => {
        expect(calls.filter((call) => !isPost(call)).length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 5000 },
    );

    const during = screen.getByTestId('canvas');
    expect(during.getAttribute('data-fixture')).toBe(before.getAttribute('data-fixture'));
    expect(during.querySelectorAll('[data-testid="component-node"]').length).toBe(beforeNodes);
    expect(screen.getByTestId('issues-panel').textContent).toBe(beforeIssues);
  });

  it('swaps draft, issues and layout together with no intermediate mixed render', async () => {
    stub(createdOr(poll('succeeded', RESULT)));
    const snapshots: Array<{ fixture: string | null; issues: string; title: string }> = [];
    const observer = new MutationObserver(() => {
      snapshots.push({
        fixture: document.querySelector('[data-testid="canvas"]')?.getAttribute('data-fixture') ?? null,
        issues: document.querySelector('[data-testid="issues-panel"]')?.textContent ?? '',
        title: document.querySelector('.side-panel-header h2')?.textContent ?? '',
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    render(<App />);
    await readyCanvas();
    await submitPrompt();
    await waitFor(() => {
      expect(screen.getByTestId('canvas').getAttribute('data-fixture')).toBe('live');
    });
    observer.disconnect();

    const liveTitle = String(RESULT.draft.title);
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.fixture === 'live' &&
          snapshot.title === liveTitle &&
          snapshot.issues.includes('live run'),
      ),
    ).toBe(true);
    expect(
      snapshots.filter(
        (snapshot) =>
          snapshot.fixture === 'live' &&
          (snapshot.title !== liveTitle || !snapshot.issues.includes('live run')),
      ),
    ).toEqual([]);
  });

  it('keeps the previous diagram when layout throws on the new draft', async () => {
    const badDraft = {
      ...FIXTURES.small.draft,
      connections: FIXTURES.small.draft.connections?.map((connection, index) =>
        index === 0 ? { ...connection, label: null } : connection,
      ),
    };
    stub(createdOr(poll('succeeded', { ...RESULT, draft: badDraft })));
    render(<App />);
    const before = await readyCanvas();

    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('run-error')).toBeTruthy());

    expect(screen.getByTestId('run-error').textContent).toContain(
      'The generated draft could not be laid out.',
    );
    expect(screen.getByTestId('canvas').getAttribute('data-fixture')).toBe(
      before.getAttribute('data-fixture'),
    );
    expect(screen.queryByTestId('lock-indicator')).toBeNull();
  });

  it('never clears the committed diagram on failure or timeout', async () => {
    for (const [state, code] of [
      ['failed', 'transport_error'],
      ['timeout', 'run_timeout'],
    ] as const) {
      stub(createdOr(poll(state, null, { code, message: 'ignored' })));
      render(<App />);
      const before = await readyCanvas();
      const beforeIssues = screen.getByTestId('issues-panel').textContent;

      await submitPrompt();
      await waitFor(() => expect(screen.getByTestId('run-error')).toBeTruthy());

      const after = screen.getByTestId('canvas');
      expect(after.getAttribute('data-fixture')).toBe(before.getAttribute('data-fixture'));
      expect(screen.getByTestId('issues-panel').textContent).toBe(beforeIssues);
      expect(screen.getByTestId('run-error').getAttribute('data-code')).toBe(code);
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});
