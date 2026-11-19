/**
 * Wire types for the local generation API.
 *
 * These describe only the JSON exchanged with the backend. They carry no
 * credentials, no provider details and no model settings.
 */

import type { ArchitectureDraft } from '../types/architecture.generated';
import type { DisplayIssue } from '../types/issues';

export type RunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'timeout';

export type RunErrorCode =
  | 'no_model_selected'
  | 'rate_limited'
  | 'provider_timeout'
  | 'run_timeout'
  | 'schema_invalid'
  | 'truncated'
  | 'transport_error'
  | 'internal_error'
  | 'connection_lost';

export interface RunError {
  code: RunErrorCode;
  message: string;
}

export type RunIssue = DisplayIssue;

export interface RunResult {
  draft: ArchitectureDraft;
  issues: RunIssue[];
  rules_version: string;
}

export interface CreateRunRequest {
  prompt: string;
}

export interface CreateRunResponse {
  run_id: string;
  state: RunState;
  started_at: string;
  max_run_seconds: number;
}

export interface GetRunResponse {
  run_id: string;
  state: RunState;
  elapsed_ms: number;
  max_run_seconds: number;
  result: RunResult | null;
  error: RunError | null;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}
