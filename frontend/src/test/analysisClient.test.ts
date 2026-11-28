import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError, analyzeCost, analyzeSecurity, runSimulation } from '../api/client';
import type { ArchitectureDraft } from '../types/architecture.generated';

const DRAFT = {
  title: 'Test',
  summary: '',
  requirements: [{ id: 'req_1', text: 'User can do a thing', kind: 'functional', source: 'inferred' }],
  components: [{
    id: 'cmp_1',
    name: 'Service',
    type: 'service',
    description: 'A service',
    assumed: false,
    requirement_refs: ['req_1'],
    attributes: { capacity_rps: '1000', hourly_cost_usd: '0.10', latency_ms: '25', replicas: '1' },
  }],
  connections: [],
  groups: [],
  assumptions: [],
  flags: [],
} as ArchitectureDraft;

const SIMULATION = {
  ok: false,
  peak_rps: 1000,
  duration_s: 60,
  total_dropped_rps: 200,
  estimated_cost_usd: 0.01,
  node_loads: [{
    component_id: 'cmp_1',
    name: 'Service',
    type: 'service',
    load_rps: 1200,
    capacity_rps: 1000,
    utilization: 1.2,
    bottleneck: true,
    replicas: 1,
    latency_ms: 25,
    hourly_cost_usd: 0.1,
  }],
  events: [{ t_s: 0, severity: 'error', component_id: 'cmp_1', connection_id: null, message: 'Overloaded' }],
  bottlenecks: [{ component_id: 'cmp_1', component_name: 'Service', utilization: 1.2, dropped_rps: 200, recommendation: 'Add replicas' }],
};

const COST = {
  currency: 'USD',
  monthly_hours: 730,
  hourly_total_usd: 0.1,
  monthly_total_usd: 73,
  items: [{
    component_id: 'cmp_1',
    name: 'Service',
    type: 'service',
    replicas: 1,
    unit_cost_usd: 0.1,
    hourly_cost_usd: 0.1,
    monthly_cost_usd: 73,
    basis: 'component.attributes.hourly_cost_usd x replicas',
  }],
};

const SECURITY = {
  passed: false,
  findings: [{
    rule: 'missing_api_gateway',
    severity: 'warning',
    title: 'Missing API gateway',
    message: 'No gateway',
    recommendation: 'Add one',
    component_id: 'cmp_1',
    connection_id: null,
  }],
};

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analysis client', () => {
  it('posts the simulation request to the local route and parses the result', async () => {
    const fetchMock = stubFetch(SIMULATION);
    const result = await runSimulation(DRAFT, 1500, 30);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/simulate');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      current_architecture: DRAFT,
      peak_rps: 1500,
      duration_s: 30,
    });
    expect(result).toEqual(SIMULATION);
  });

  it('posts the cost request to the local route and parses the result', async () => {
    const fetchMock = stubFetch(COST);
    const result = await analyzeCost(DRAFT);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/cost');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ current_architecture: DRAFT });
    expect(result).toEqual(COST);
  });

  it('posts the security request to the local route and parses the result', async () => {
    const fetchMock = stubFetch(SECURITY);
    const result = await analyzeSecurity(DRAFT);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/security');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ current_architecture: DRAFT });
    expect(result).toEqual(SECURITY);
  });

  it('maps error bodies to ApiRequestError', async () => {
    stubFetch({ error: { code: 'internal_error', message: 'analysis failed' } }, 422);
    await expect(runSimulation(DRAFT, 1000, 60)).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 422,
      message: 'analysis failed',
    });
    await expect(analyzeCost(DRAFT)).rejects.toBeInstanceOf(ApiRequestError);
  });
});
