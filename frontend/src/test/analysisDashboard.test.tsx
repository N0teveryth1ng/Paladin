import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import type { ArchitectureDraft } from '../types/architecture.generated';

const DRAFT = {
  title: 'Small system',
  summary: '',
  requirements: [{ id: 'req_1', text: 'User loads a page', kind: 'functional', source: 'inferred' }],
  components: [
    { id: 'cmp_client', name: 'Client', type: 'client', description: 'Browser', assumed: false, requirement_refs: ['req_1'] },
    { id: 'cmp_service', name: 'Service', type: 'service', description: 'API', assumed: false, requirement_refs: ['req_1'] },
  ],
  connections: [{
    id: 'cnx_1', from: 'cmp_client', to: 'cmp_service', label: 'Request', type: 'sync',
    technology: null, requirement_refs: ['req_1'], assumed: false, rationale: null,
  }],
  groups: [],
  assumptions: [],
  flags: [],
} as ArchitectureDraft;

const SIMULATION = {
  ok: false,
  peak_rps: 1000,
  duration_s: 60,
  total_dropped_rps: 700,
  estimated_cost_usd: 0.02,
  node_loads: [],
  events: [{ t_s: 60, severity: 'info', component_id: null, connection_id: null, message: 'Finished' }],
  bottlenecks: [{
    component_id: 'cmp_service',
    component_name: 'Service',
    utilization: 1.7,
    dropped_rps: 700,
    recommendation: 'Add replicas',
  }],
};

function seedWorkspace(): void {
  localStorage.setItem('paladin.workspace.v1', JSON.stringify({
    version: 1,
    draft: DRAFT,
    positions: {},
    chatMessages: [],
    chatSessions: [],
    activeChatId: null,
    checkpoints: [],
    theme: 'light',
    sidebarWidth: 400,
  }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('analysis dashboard', () => {
  it('switches between the canvas and analysis panels', () => {
    seedWorkspace();
    render(<App />);

    expect(screen.getByTestId('canvas')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dashboard-tab-cost'));
    expect(screen.getByTestId('dashboard-panel-cost')).toBeTruthy();
    expect(screen.queryByTestId('canvas')).toBeNull();
    fireEvent.click(screen.getByTestId('dashboard-tab-security'));
    expect(screen.getByTestId('dashboard-panel-security')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dashboard-tab-simulation'));
    expect(screen.getByTestId('dashboard-panel-simulation')).toBeTruthy();
    expect(screen.getByTestId('peak-rps-input')).toHaveValue(1000);
    expect(screen.getByTestId('duration-s-input')).toHaveValue(60);
    fireEvent.click(screen.getByTestId('dashboard-tab-canvas'));
    expect(screen.getByTestId('canvas')).toBeTruthy();
  });

  it('runs a simulation and marks the bottleneck node red on the canvas', async () => {
    seedWorkspace();
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => SIMULATION,
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await waitFor(() => expect(document.querySelectorAll('[data-testid="component-node"]').length).toBe(2));
    fireEvent.click(screen.getByTestId('run-simulation'));

    await waitFor(() => expect(screen.getByTestId('dashboard-panel-simulation')).toBeTruthy());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/simulate$/);
    expect(screen.getByTestId('simulation-summary').textContent).toContain('bottlenecks found');
    expect(screen.getByTestId('fix-bottlenecks')).toBeEnabled();

    fireEvent.click(screen.getByTestId('dashboard-tab-canvas'));
    await waitFor(() => expect(document.querySelector('[data-bottleneck="1"]')).not.toBeNull());
    const node = document.querySelector('[data-component-id="cmp_service"]');
    expect(node?.getAttribute('data-bottleneck')).toBe('1');
    expect(node?.getAttribute('aria-label')).toContain(', bottleneck');
    expect((node as HTMLElement | null)?.style.borderColor).toBe('#ef4444');
    expect((node as HTMLElement | null)?.style.background).toBe('rgba(127, 29, 29, 0.55)');
  });

  it('clears analysis when the document changes', async () => {
    seedWorkspace();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => SIMULATION,
    }) as Response));
    render(<App />);
    fireEvent.click(screen.getByTestId('run-simulation'));
    await waitFor(() => expect(screen.getByTestId('simulation-summary')).toBeTruthy());

    fireEvent.click(screen.getByTestId('new-design'));
    expect(screen.queryByTestId('simulation-summary')).toBeNull();
    fireEvent.click(screen.getByTestId('dashboard-tab-simulation'));
    expect(screen.getByTestId('dashboard-panel-simulation').textContent).toContain('No simulation has been run');
  });
});
