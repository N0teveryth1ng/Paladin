/**
 * The only runtime module that talks to the local backend.
 *
 * The origin is a single configured loopback constant. No credential, no
 * provider endpoint and no environment-supplied URL is read here. Callers map
 * transport failures and missing runs to their own error state.
 */

import type { ApiErrorPayload, CreateRunResponse, GetRunResponse } from './types';

const LOCAL_BACKEND_ORIGIN = 'http://127.0.0.1:8000';
const RUNS_PATH = '/api/runs';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

async function readError(response: Response): Promise<ApiRequestError> {
  let code = 'internal_error';
  let message = 'The local backend returned an error.';

  try {
    const body = (await response.json()) as Partial<ApiErrorPayload> | null;
    const detail = body?.error;
    if (detail !== undefined && detail !== null && typeof detail === 'object') {
      if (typeof detail.code === 'string' && detail.code.length > 0) {
        code = detail.code;
      }
      if (typeof detail.message === 'string' && detail.message.length > 0) {
        message = detail.message;
      }
    }
  } catch {
    // Keep the fixed defaults when the error body is not JSON.
  }

  return new ApiRequestError(response.status, code, message);
}

export async function createRun(prompt: string): Promise<CreateRunResponse> {
  const response = await fetch(`${LOCAL_BACKEND_ORIGIN}${RUNS_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as CreateRunResponse;
}

export async function getRun(runId: string): Promise<GetRunResponse> {
  const response = await fetch(`${LOCAL_BACKEND_ORIGIN}${RUNS_PATH}/${encodeURIComponent(runId)}`, {
    method: 'GET',
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as GetRunResponse;
}
