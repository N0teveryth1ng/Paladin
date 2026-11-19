/**
 * Pure helpers for the live-run state machine.
 *
 * Nothing here reads the clock, the network or the DOM. App owns the timers and
 * the polling loop; these functions only format, validate and assemble values,
 * so the atomic-commit rules can be tested directly.
 */

import type { RunErrorCode, RunResult } from '../api/types';
import type { LayoutResult } from '../layout/layoutTypes';
import type { DisplayIssue } from '../types/issues';

import type { LiveEntry } from './modes';

export const POLL_INTERVAL_MS = 1000;
export const ELAPSED_TICK_MS = 250;

export interface PendingRun {
  id: string;
  state: 'queued' | 'running';
  elapsedMs: number;
  maxRunSeconds: number;
}

export interface RunErrorView {
  code: RunErrorCode;
  message: string;
}

export interface AtomicCommit {
  entry: LiveEntry;
  layout: LayoutResult;
}

/** The exact rate-limit text. No retry is made and no reset time is computed. */
export const RATE_LIMITED_MESSAGE =
  'Free-model daily limit reached (HTTP 429). No retry was made. Try again after the daily reset at 00:00 UTC.';

export const RUN_TIMEOUT_MESSAGE =
  'The run exceeded the maximum time (25:00) and was stopped. The previous diagram was kept.';

export const PROVIDER_TIMEOUT_MESSAGE =
  'The model provider timed out after its retries. The previous diagram was kept.';

export const CONNECTION_LOST_MESSAGE =
  'The connection to the local backend was lost. The previous diagram was kept.';

export const LAYOUT_FAILURE_MESSAGE =
  'The generated draft could not be laid out. The previous diagram was kept.';

const KNOWN_ERROR_CODES: readonly RunErrorCode[] = [
  'no_model_selected',
  'rate_limited',
  'provider_timeout',
  'run_timeout',
  'schema_invalid',
  'truncated',
  'transport_error',
  'internal_error',
  'connection_lost',
];

/** Format a duration as m:ss, used for both elapsed time and the server maximum. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Render the maximum as "max 25:00" from a server-supplied second count. */
export function formatRunMaximum(maxRunSeconds: number): string {
  return `max ${formatElapsed(maxRunSeconds * 1000)}`;
}

export function normalizeErrorCode(code: unknown): RunErrorCode {
  if (typeof code === 'string' && KNOWN_ERROR_CODES.includes(code as RunErrorCode)) {
    return code as RunErrorCode;
  }
  return 'internal_error';
}

/** Fixed, code-specific text. Raw provider or backend exception text is never used. */
export function errorMessage(code: RunErrorCode): string {
  switch (code) {
    case 'rate_limited':
      return RATE_LIMITED_MESSAGE;
    case 'run_timeout':
      return RUN_TIMEOUT_MESSAGE;
    case 'provider_timeout':
      return PROVIDER_TIMEOUT_MESSAGE;
    case 'connection_lost':
      return CONNECTION_LOST_MESSAGE;
    case 'no_model_selected':
      return 'No model is selected. The backend needs a selected model in freeze.json; no fallback is used.';
    case 'schema_invalid':
      return 'The generated draft did not match the frozen schema. The previous diagram was kept.';
    case 'truncated':
      return 'The model response was truncated. The previous diagram was kept.';
    case 'transport_error':
      return 'The local backend could not reach the model. The previous diagram was kept.';
    case 'internal_error':
      return 'The run failed unexpectedly. The previous diagram was kept.';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIssue(value: unknown): value is DisplayIssue {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.kind === 'string' &&
    (value.severity === 'invalid' || value.severity === 'judgment') &&
    (value.element_id === null || typeof value.element_id === 'string') &&
    typeof value.message === 'string'
  );
}

/**
 * Guard the success payload before it reaches layout. This is a shape check,
 * not a rewrite: the draft itself is passed to layout untouched.
 */
export function isValidRunResult(value: unknown): value is RunResult {
  if (!isRecord(value)) {
    return false;
  }
  const draft = value.draft;
  if (
    !isRecord(draft) ||
    !Array.isArray(draft.components) ||
    !Array.isArray(draft.requirements) ||
    typeof draft.title !== 'string' ||
    typeof draft.summary !== 'string'
  ) {
    return false;
  }
  return (
    Array.isArray(value.issues) &&
    value.issues.every(isIssue) &&
    typeof value.rules_version === 'string' &&
    value.rules_version.length > 0
  );
}

/** Wrap a validated success payload as the live side-panel entry. */
export function toLiveEntry(result: RunResult): LiveEntry {
  return {
    name: 'live',
    label: 'Live run',
    file: 'live',
    draft: result.draft,
    issues: {
      fixture: 'live run',
      rules_version: result.rules_version,
      issues: result.issues,
    },
  };
}

/**
 * The single object App commits on success. Draft, validator issues and the
 * computed layout are produced together, so there is no render with a new
 * draft and stale issues (or the reverse).
 */
export function prepareCommit(result: RunResult, layout: LayoutResult): AtomicCommit {
  return { entry: toLiveEntry(result), layout };
}
