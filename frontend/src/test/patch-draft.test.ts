import { describe, expect, it } from 'vitest';
import { applyPatchOperations } from '../app/patchDraft';
import type { ArchitectureDraft } from '../types/architecture.generated';

function baseDraft(): ArchitectureDraft {
  return {
    title: 'Test',
    summary: 'Test system',
    requirements: [{ id: 'req_1', text: 'User can do thing', kind: 'functional' }],
    assumptions: [],
    components: [
      { id: 'c_api', name: 'API', type: 'service', technology: null, description: 'API', attributes: {}, requirement_refs: ['req_1'], assumed: false, rationale: null },
      { id: 'c_db', name: 'DB', type: 'database', technology: 'Postgres', description: 'DB', attributes: {}, requirement_refs: ['req_1'], assumed: false, rationale: null },
    ],
    connections: [
      { id: 'x1', from: 'c_api', to: 'c_db', label: 'Reads', type: 'sync', technology: null, requirement_refs: ['req_1'], assumed: false, rationale: null },
    ],
    groups: [],
  } as unknown as ArchitectureDraft;
}

describe('applyPatchOperations', () => {
  it('applies small edits atomically and validates result', () => {
    const draft = baseDraft();
    const next = applyPatchOperations(draft, [
      { op: 'add_component', component: { id: 'c_cache', name: 'Cache', type: 'cache', description: 'Cache', requirement_refs: ['req_1'] } },
      { op: 'add_connection', connection: { id: 'x2', from: 'c_api', to: 'c_cache', label: 'Checks cache', type: 'sync', requirement_refs: ['req_1'] } },
    ]);
    expect(next.components.some((c) => c.id === 'c_cache')).toBe(true);
    expect(next.connections?.some((c) => c.id === 'x2')).toBe(true);
    expect(draft.components.some((c) => c.id === 'c_cache')).toBe(false);
  });

  it('rejects invalid connection endpoints', () => {
    const draft = baseDraft();
    expect(() => applyPatchOperations(draft, [
      { op: 'add_connection', connection: { id: 'bad', from: 'c_api', to: 'missing', label: 'bad', type: 'sync', requirement_refs: ['req_1'] } },
    ])).not.toThrow(); // invalid op is ignored safely
    const next = applyPatchOperations(draft, [
      { op: 'add_connection', connection: { id: 'bad', from: 'c_api', to: 'missing', label: 'bad', type: 'sync', requirement_refs: ['req_1'] } },
    ]);
    expect(next.connections?.some((c) => c.id === 'bad')).toBe(false);
  });

  it('supports bulk operations and group membership updates', () => {
    const draft = baseDraft();
    const next = applyPatchOperations(draft, [
      { op: 'add_group', group: { id: 'g1', name: 'Backend', members: ['c_api'] } },
      { op: 'bulk', operations: [
        { op: 'update_component', id: 'c_db', patch: { group_id: 'g1' } },
        { op: 'set_title', name: 'Updated' },
      ] },
    ]);
    expect(next.title).toBe('Updated');
    expect(next.groups?.find((g) => g.id === 'g1')?.members).toContain('c_db');
  });
});
