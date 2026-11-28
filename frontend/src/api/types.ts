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

export interface UpdateRunRequest {
  request: string;
  current_architecture: ArchitectureDraft;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
}

export interface AssistantRequest {
  message: string;
  messages: ChatTurn[];
  current_architecture?: ArchitectureDraft | null;
  selected_id?: string | null;
  selected_kind?: 'component' | 'connection' | 'group' | null;
  simulation?: SimulationResult | null;
}

export interface PatchOperation {
  op:
    | 'set_title'
    | 'set_summary'
    | 'add_component'
    | 'update_component'
    | 'remove_component'
    | 'add_connection'
    | 'update_connection'
    | 'remove_connection'
    | 'add_group'
    | 'update_group'
    | 'remove_group'
    | 'bulk';
  id?: string | null;
  name?: string | null;
  summary?: string | null;
  component?: Record<string, unknown> | null;
  connection?: Record<string, unknown> | null;
  group?: Record<string, unknown> | null;
  patch?: Record<string, unknown> | null;
  operations?: PatchOperation[] | null;
}

export interface AssistantResponse {
  kind: 'chat' | 'small_edit' | 'major_redesign' | 'review';
  reply: string;
  operations: PatchOperation[];
  redesign_prompt?: string | null;
}

export interface SimulationRequest {
  current_architecture: ArchitectureDraft;
  peak_rps: number;
  duration_s: number;
}

export interface SimulationEvent {
  t_s: number;
  severity: 'info' | 'warning' | 'error';
  component_id: string | null;
  connection_id: string | null;
  message: string;
}

export interface NodeLoad {
  component_id: string;
  name: string;
  type: string;
  load_rps: number;
  capacity_rps: number;
  utilization: number;
  bottleneck: boolean;
  replicas: number;
  latency_ms: number;
  hourly_cost_usd: number;
}

export interface Bottleneck {
  component_id: string;
  component_name: string;
  utilization: number;
  dropped_rps: number;
  recommendation: string;
}

export interface SimulationResult {
  ok: boolean;
  peak_rps: number;
  duration_s: number;
  total_dropped_rps: number;
  estimated_cost_usd: number;
  node_loads: NodeLoad[];
  events: SimulationEvent[];
  bottlenecks: Bottleneck[];
}

export interface CostRequest {
  current_architecture: ArchitectureDraft;
}

export interface CostItem {
  component_id: string;
  name: string;
  type: string;
  replicas: number;
  unit_cost_usd: number;
  hourly_cost_usd: number;
  monthly_cost_usd: number;
  basis: string;
}

export interface CostResult {
  currency: string;
  monthly_hours: number;
  hourly_total_usd: number;
  monthly_total_usd: number;
  items: CostItem[];
}

export interface SecurityRequest {
  current_architecture: ArchitectureDraft;
}

export interface SecurityFinding {
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  recommendation: string;
  component_id: string | null;
  connection_id: string | null;
}

export interface SecurityResult {
  passed: boolean;
  findings: SecurityFinding[];
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
