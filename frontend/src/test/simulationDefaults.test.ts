import { describe, expect, it } from 'vitest';

import { applyPatchOperations } from '../app/patchDraft';
import { defaultAttributesForType, withSimulationDefaults } from '../app/simulationDefaults';
import type { ArchitectureDraft, Component } from '../types/architecture.generated';

function component(overrides: Partial<Component> = {}): Component {
  return {
    id: 'cmp_1',
    name: 'Service',
    type: 'service',
    description: 'A service',
    assumed: false,
    requirement_refs: ['req_1'],
    ...overrides,
  };
}

function draftWith(componentValue: Component): ArchitectureDraft {
  return {
    title: 'Test',
    summary: '',
    requirements: [{ id: 'req_1', text: 'User can do a thing', kind: 'functional', source: 'inferred' }],
    components: [componentValue],
    connections: [],
    groups: [],
    assumptions: [],
    flags: [],
  } as ArchitectureDraft;
}

const EXPECTED: Array<[Component['type'], Record<string, string>]> = [
  ['client', { capacity_rps: '5000', hourly_cost_usd: '0.00', latency_ms: '5', replicas: '1' }],
  ['api_gateway', { capacity_rps: '3000', hourly_cost_usd: '0.08', latency_ms: '10', replicas: '1' }],
  ['load_balancer', { capacity_rps: '8000', hourly_cost_usd: '0.12', latency_ms: '5', replicas: '1' }],
  ['service', { capacity_rps: '1000', hourly_cost_usd: '0.10', latency_ms: '25', replicas: '1' }],
  ['worker', { capacity_rps: '500', hourly_cost_usd: '0.06', latency_ms: '40', replicas: '1' }],
  ['database', { capacity_rps: '800', hourly_cost_usd: '0.25', latency_ms: '15', replicas: '1' }],
  ['cache', { capacity_rps: '5000', hourly_cost_usd: '0.12', latency_ms: '2', replicas: '1' }],
  ['message_queue', { capacity_rps: '4000', hourly_cost_usd: '0.09', latency_ms: '8', replicas: '1' }],
  ['object_storage', { capacity_rps: '2000', hourly_cost_usd: '0.05', latency_ms: '30', replicas: '1' }],
  ['cdn', { capacity_rps: '10000', hourly_cost_usd: '0.15', latency_ms: '3', replicas: '1' }],
  ['auth_provider', { capacity_rps: '1500', hourly_cost_usd: '0.07', latency_ms: '20', replicas: '1' }],
  ['search_index', { capacity_rps: '1200', hourly_cost_usd: '0.18', latency_ms: '35', replicas: '1' }],
  ['scheduler', { capacity_rps: '300', hourly_cost_usd: '0.04', latency_ms: '50', replicas: '1' }],
  ['external_service', { capacity_rps: '1000', hourly_cost_usd: '0.02', latency_ms: '80', replicas: '1' }],
];

describe('simulation defaults', () => {
  it('matches the backend defaults for every component type', () => {
    for (const [type, expected] of EXPECTED) {
      expect(defaultAttributesForType(type), type).toEqual(expected);
    }
  });

  it('returns a fresh map on every call', () => {
    const first = defaultAttributesForType('service');
    first.capacity_rps = '1';
    expect(defaultAttributesForType('service').capacity_rps).toBe('1000');
  });

  it('fills only missing keys and preserves existing values', () => {
    const original = component({ attributes: { capacity_rps: '123', protocol: 'https' } });
    const draft = draftWith(original);
    const before = JSON.parse(JSON.stringify(draft)) as ArchitectureDraft;

    const next = withSimulationDefaults(draft);

    expect(next.components[0].attributes).toEqual({
      capacity_rps: '123',
      protocol: 'https',
      hourly_cost_usd: '0.10',
      latency_ms: '25',
      replicas: '1',
    });
    expect(draft).toEqual(before);
    expect(next).not.toBe(draft);
    expect(next.components[0]).not.toBe(original);
  });

  it('respects the 12-entry free-form attribute limit', () => {
    const full = component({
      attributes: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`extra_${i}`, String(i)])),
    });
    expect(Object.keys(withSimulationDefaults(draftWith(full)).components[0].attributes ?? {})).toHaveLength(12);
    expect(withSimulationDefaults(draftWith(full)).components[0].attributes).not.toHaveProperty('capacity_rps');

    const almostFull = component({
      attributes: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`extra_${i}`, String(i)])),
    });
    const filled = withSimulationDefaults(draftWith(almostFull)).components[0].attributes ?? {};
    expect(Object.keys(filled)).toHaveLength(12);
    expect(filled.capacity_rps).toBe('1000');
    expect(filled).not.toHaveProperty('replicas');
  });

  it('gives patch-added components simulation attributes without replacing supplied ones', () => {
    const draft = draftWith(component({ id: 'cmp_api', name: 'API', type: 'api_gateway' }));
    const next = applyPatchOperations(draft, [
      {
        op: 'add_component',
        component: { id: 'cmp_db', name: 'DB', type: 'database', attributes: { capacity_rps: '200' }, requirement_refs: ['req_1'] },
      },
      { op: 'update_component', id: 'cmp_api', patch: { attributes: { latency_ms: '99' } } },
    ]);
    const added = next.components.find((item) => item.id === 'cmp_db');
    const updated = next.components.find((item) => item.id === 'cmp_api');

    expect(added?.attributes).toEqual({
      capacity_rps: '200',
      hourly_cost_usd: '0.25',
      latency_ms: '15',
      replicas: '1',
    });
    expect(updated?.attributes).toEqual({
      latency_ms: '99',
      capacity_rps: '3000',
      hourly_cost_usd: '0.08',
      replicas: '1',
    });
  });
});
