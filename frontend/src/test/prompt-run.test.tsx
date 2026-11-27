import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { RATE_LIMITED_MESSAGE } from '../app/live';
import { FIXTURES } from '../app/modes';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface FetchCall {
  url: string;
  init?: RequestInit;
}

interface StubResponse {
  status: number;
  body: unknown;
}

type Responder = (call: FetchCall) => StubResponse;

function stubFetch(responder: Responder): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const call: FetchCall = { url: String(input), init };
      calls.push(call);
      const { status, body } = responder(call);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }),
  );
  return calls;
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

function pollBody(state: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: 'run_1',
    state,
    elapsed_ms: 42_000,
    max_run_seconds: 1500,
    result: null,
    error: null,
    ...extra,
  };
}

function isPost(call: FetchCall): boolean {
  return call.init?.method === 'POST';
}

function createdOr(responder: Responder): Responder {
  return (call) => (isPost(call) ? { status: 202, body: CREATED } : responder(call));
}

async function waitForCanvas(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(document.querySelector('[data-testid="canvas"]')).not.toBeNull();
  });
  return screen.getByTestId('canvas');
}

async function submitPrompt(): Promise<void> {
  fireEvent.change(screen.getByTestId('prompt-input'), {
    target: { value: 'Design a URL shortener with analytics.' },
  });
  fireEvent.click(screen.getByTestId('generate-button'));
}

describe('prompt and live run', () => {
  it('is idle with an enabled prompt box, a disabled empty Generate button and no lock', () => {
    render(<App />);

    expect(screen.getByTestId('prompt-input')).toBeEnabled();
    expect(screen.getByTestId('generate-button')).toBeDisabled();
    expect(screen.queryByTestId('lock-indicator')).toBeNull();
    expect(screen.getByTestId('fixture-select')).toBeEnabled();
  });

  it('posts the prompt once, locks the canvas and shows the elapsed timer', async () => {
    const calls = stubFetch(createdOr(() => ({ status: 200, body: pollBody('running') })));
    render(<App />);
    await submitPrompt();

    await waitFor(() => expect(screen.getByTestId('lock-indicator')).toBeTruthy());
    expect(calls[0].url).toMatch(/\/api\/runs$/);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body)).prompt).toBe(
      'Design a URL shortener with analytics.',
    );
    expect(screen.getByTestId('prompt-input')).toHaveValue('');
    expect(screen.getByTestId('prompt-input')).toBeDisabled();
    expect(screen.getByTestId('fixture-select')).toBeDisabled();
    expect(screen.getByTestId('fit-button')).toBeDisabled();
    expect(screen.getByTestId('run-status').getAttribute('data-state')).toBe('running');
    expect(screen.getByTestId('run-elapsed').textContent).toMatch(/^\d+:\d{2}$/);
    expect(screen.getByTestId('run-max')).toHaveTextContent('max 25:00');
    expect(screen.getByTestId('run-progress').getAttribute('aria-valuenow')).toBeNull();
  });

  it('applies a succeeded payload, releases the lock and stops the timer', async () => {
    stubFetch(
      createdOr(() => ({
        status: 200,
        body: pollBody('succeeded', { result: RESULT }),
      })),
    );
    render(<App />);
    const before = await waitForCanvas();
    expect(before.getAttribute('data-fixture')).toBe('small');

    await submitPrompt();
    await waitFor(() => {
      expect(screen.getByTestId('canvas').getAttribute('data-fixture')).toBe('live');
    });

    expect(screen.queryByTestId('lock-indicator')).toBeNull();
    expect(screen.getByTestId('prompt-input')).toBeEnabled();
    expect(screen.getByTestId('run-status').getAttribute('data-state')).toBe('idle');
    expect(screen.queryByTestId('run-elapsed')).toBeNull();
    expect(screen.getByTestId('issues-panel').textContent).toContain('live run');
    expect(screen.getByTestId('fixture-select')).toContainHTML(
      '<option value="live" disabled="">Live run</option>',
    );
  });

  it('keeps the previous diagram and releases the lock on a failed run', async () => {
    stubFetch(
      createdOr(() => ({
        status: 200,
        body: pollBody('failed', { error: { code: 'internal_error', message: 'raw text' } }),
      })),
    );
    render(<App />);
    const before = await waitForCanvas();
    const beforeTransform = before.getAttribute('data-viewport-transform');

    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('run-error')).toBeTruthy());

    const after = screen.getByTestId('canvas');
    expect(after.getAttribute('data-fixture')).toBe(before.getAttribute('data-fixture'));
    expect(after.getAttribute('data-viewport-transform')).toBe(beforeTransform);
    expect(screen.queryByTestId('lock-indicator')).toBeNull();
    expect(screen.getByTestId('prompt-input')).toBeEnabled();
    expect(screen.getByTestId('run-error').textContent).not.toContain('raw text');
  });

  it('shows the exact rate-limit message for HTTP 429', async () => {
    stubFetch(
      createdOr(() => ({
        status: 200,
        body: pollBody('failed', { error: { code: 'rate_limited', message: 'ignored' } }),
      })),
    );
    render(<App />);
    const before = await waitForCanvas();

    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('run-error')).toBeTruthy());

    const error = screen.getByTestId('run-error');
    expect(error.getAttribute('data-code')).toBe('rate_limited');
    expect(error.textContent).toContain(RATE_LIMITED_MESSAGE);
    expect(error.textContent).not.toContain('ignored');
    expect(screen.getByTestId('canvas').getAttribute('data-fixture')).toBe(
      before.getAttribute('data-fixture'),
    );
  });

  it('shows the run-timeout message, releases the lock and keeps the diagram', async () => {
    stubFetch(
      createdOr(() => ({
        status: 200,
        body: pollBody('timeout', { error: { code: 'run_timeout', message: 'ignored' } }),
      })),
    );
    render(<App />);
    const before = await waitForCanvas();

    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('run-error')).toBeTruthy());

    expect(screen.getByTestId('run-error').getAttribute('data-code')).toBe('run_timeout');
    expect(screen.getByTestId('run-error').textContent).toContain(
      'The run exceeded the maximum time (25:00) and was stopped.',
    );
    expect(screen.getByTestId('canvas').getAttribute('data-fixture')).toBe(
      before.getAttribute('data-fixture'),
    );
    expect(screen.queryByTestId('lock-indicator')).toBeNull();
  });

  it('renders no cancel button while a run is active', async () => {
    stubFetch(createdOr(() => ({ status: 200, body: pollBody('running') })));
    render(<App />);
    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('lock-indicator')).toBeTruthy());

    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    expect(screen.queryByText(/cancel/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('treats a poll failure as connection_lost and keeps the previous diagram', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return { ok: true, status: 202, json: async () => CREATED } as Response;
        }
        expect(String(input)).toMatch(/\/api\/runs\/run_1$/);
        throw new Error('server went away');
      }),
    );
    render(<App />);
    const before = await waitForCanvas();

    await submitPrompt();
    await waitFor(() => expect(screen.getByTestId('run-error')).toBeTruthy());

    expect(screen.getByTestId('run-error').getAttribute('data-code')).toBe('connection_lost');
    expect(screen.getByTestId('run-error').textContent).toContain(
      'The connection to the local backend was lost.',
    );
    expect(screen.getByTestId('canvas').getAttribute('data-fixture')).toBe(
      before.getAttribute('data-fixture'),
    );
    expect(screen.queryByTestId('lock-indicator')).toBeNull();
  });
});
