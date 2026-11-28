/**
 * Deterministic simulation attributes for schema-pinned architecture drafts.
 *
 * The graph schema is frozen, so capacity/cost/latency metadata lives in the
 * component's free-form string attribute map. These defaults mirror the local
 * backend exactly and are only used to fill keys that are absent; stored values
 * are never replaced.
 */

import type { ArchitectureDraft, Component } from '../types/architecture.generated';

const MAX_ATTRIBUTE_ENTRIES = 12;
const SIMULATION_KEYS = ['capacity_rps', 'hourly_cost_usd', 'latency_ms', 'replicas'] as const;

const DEFAULTS: Record<Component['type'], Record<string, string>> = {
  client: { capacity_rps: '5000', hourly_cost_usd: '0.00', latency_ms: '5', replicas: '1' },
  api_gateway: { capacity_rps: '3000', hourly_cost_usd: '0.08', latency_ms: '10', replicas: '1' },
  load_balancer: { capacity_rps: '8000', hourly_cost_usd: '0.12', latency_ms: '5', replicas: '1' },
  service: { capacity_rps: '1000', hourly_cost_usd: '0.10', latency_ms: '25', replicas: '1' },
  worker: { capacity_rps: '500', hourly_cost_usd: '0.06', latency_ms: '40', replicas: '1' },
  database: { capacity_rps: '800', hourly_cost_usd: '0.25', latency_ms: '15', replicas: '1' },
  cache: { capacity_rps: '5000', hourly_cost_usd: '0.12', latency_ms: '2', replicas: '1' },
  message_queue: { capacity_rps: '4000', hourly_cost_usd: '0.09', latency_ms: '8', replicas: '1' },
  object_storage: { capacity_rps: '2000', hourly_cost_usd: '0.05', latency_ms: '30', replicas: '1' },
  cdn: { capacity_rps: '10000', hourly_cost_usd: '0.15', latency_ms: '3', replicas: '1' },
  auth_provider: { capacity_rps: '1500', hourly_cost_usd: '0.07', latency_ms: '20', replicas: '1' },
  search_index: { capacity_rps: '1200', hourly_cost_usd: '0.18', latency_ms: '35', replicas: '1' },
  scheduler: { capacity_rps: '300', hourly_cost_usd: '0.04', latency_ms: '50', replicas: '1' },
  external_service: { capacity_rps: '1000', hourly_cost_usd: '0.02', latency_ms: '80', replicas: '1' },
};

export function defaultAttributesForType(type: Component['type']): Record<string, string> {
  return { ...(DEFAULTS[type] ?? DEFAULTS.service) };
}

/** Fill missing simulation keys without mutating or exceeding the schema limit. */
export function fillSimulationAttributes(
  type: Component['type'],
  attributes?: Component['attributes'],
): Record<string, string> {
  const result: Record<string, string> = { ...(attributes ?? {}) };
  let slots = MAX_ATTRIBUTE_ENTRIES - Object.keys(result).length;
  if (slots <= 0) return result;
  const defaults = defaultAttributesForType(type);
  for (const key of SIMULATION_KEYS) {
    if (slots === 0) break;
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = defaults[key];
      slots -= 1;
    }
  }
  return result;
}

export function withSimulationDefaults(draft: ArchitectureDraft): ArchitectureDraft {
  return {
    ...draft,
    components: draft.components.map((component) => ({
      ...component,
      attributes: fillSimulationAttributes(component.type, component.attributes),
    })),
  };
}
