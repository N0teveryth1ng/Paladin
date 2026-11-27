import type { ArchitectureDraft, Component, Connection, Group } from '../types/architecture.generated';
import type { PatchOperation } from '../api/types';

const COMPONENT_TYPES = new Set(['client','api_gateway','load_balancer','service','worker','database','cache','message_queue','object_storage','cdn','auth_provider','search_index','scheduler','external_service']);
const CONNECTION_TYPES = new Set(['sync', 'async']);

function cloneDraft(draft: ArchitectureDraft): ArchitectureDraft {
  return JSON.parse(JSON.stringify(draft)) as ArchitectureDraft;
}

function ensureId(prefix: string, raw: unknown, used: Set<string>): string {
  const base = typeof raw === 'string' && raw.trim() ? raw.trim() : `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  let id = base;
  let i = 1;
  while (used.has(id)) id = `${base}_${i++}`;
  used.add(id);
  return id;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeComponent(rawIn: Record<string, unknown>, id: string, fallbackReq: string, prev?: Component): Component {
  const reqRefs = asStringArray(rawIn.requirement_refs);
  const type = String(rawIn.type ?? prev?.type ?? 'service');
  return {
    id,
    name: String(rawIn.name ?? prev?.name ?? 'New component').trim() || prev?.name || 'New component',
    type: (COMPONENT_TYPES.has(type) ? type : (prev?.type ?? 'service')) as Component['type'],
    technology: (typeof rawIn.technology === 'string' ? rawIn.technology : (rawIn.technology === null ? null : (prev?.technology ?? null))),
    description: String(rawIn.description ?? prev?.description ?? '').trim(),
    attributes: (rawIn.attributes && typeof rawIn.attributes === 'object' && !Array.isArray(rawIn.attributes))
      ? rawIn.attributes as Component['attributes']
      : (prev?.attributes ?? {}),
    requirement_refs: reqRefs.length > 0 ? reqRefs : (prev?.requirement_refs?.length ? prev.requirement_refs : [fallbackReq]),
    assumed: typeof rawIn.assumed === 'boolean' ? rawIn.assumed : Boolean(prev?.assumed),
    rationale: typeof rawIn.rationale === 'string' ? rawIn.rationale : (rawIn.rationale === null ? null : (prev?.rationale ?? null)),
  };
}

function normalizeConnection(rawIn: Record<string, unknown>, id: string, fallbackReq: string, prev?: Connection): Connection {
  const reqRefs = asStringArray(rawIn.requirement_refs);
  const type = String(rawIn.type ?? prev?.type ?? 'sync');
  return {
    id,
    from: String(rawIn.from ?? rawIn.from_id ?? prev?.from ?? ''),
    to: String(rawIn.to ?? rawIn.to_id ?? prev?.to ?? ''),
    label: String(rawIn.label ?? prev?.label ?? 'Request').trim() || 'Request',
    type: (CONNECTION_TYPES.has(type) ? type : (prev?.type ?? 'sync')) as Connection['type'],
    technology: typeof rawIn.technology === 'string' ? rawIn.technology : (rawIn.technology === null ? null : (prev?.technology ?? null)),
    requirement_refs: reqRefs.length > 0 ? reqRefs : (prev?.requirement_refs?.length ? prev.requirement_refs : [fallbackReq]),
    assumed: typeof rawIn.assumed === 'boolean' ? rawIn.assumed : Boolean(prev?.assumed),
    rationale: typeof rawIn.rationale === 'string' ? rawIn.rationale : (rawIn.rationale === null ? null : (prev?.rationale ?? null)),
  };
}

function normalizeGroup(rawIn: Record<string, unknown>, id: string, validComponentIds: Set<string>, prev?: Group): Group {
  const membersRaw = rawIn.members ?? rawIn.components;
  const members = asStringArray(membersRaw).filter((cid) => validComponentIds.has(cid));
  const reqRefs = asStringArray(rawIn.requirement_refs);
  return {
    id,
    name: String(rawIn.name ?? prev?.name ?? 'Group').trim() || 'Group',
    description: String(rawIn.description ?? prev?.description ?? '').trim(),
    members: members.length > 0 ? members : (prev?.members ?? []),
    assumed: typeof rawIn.assumed === 'boolean' ? rawIn.assumed : Boolean(prev?.assumed),
    parent_id: typeof rawIn.parent_id === 'string' ? rawIn.parent_id : (rawIn.parent_id === null ? null : (prev?.parent_id ?? null)),
    rationale: typeof rawIn.rationale === 'string' ? rawIn.rationale : (rawIn.rationale === null ? null : (prev?.rationale ?? null)),
    requirement_refs: reqRefs.length > 0 ? reqRefs : prev?.requirement_refs,
  };
}

function validateDraft(draft: ArchitectureDraft): void {
  if (!draft || typeof draft !== 'object') throw new Error('Invalid draft');
  if (!Array.isArray(draft.components)) throw new Error('Invalid components');
  const ids = new Set<string>();
  for (const c of draft.components) {
    if (!c || typeof c.id !== 'string' || !c.id) throw new Error('Invalid component id');
    if (ids.has(c.id)) throw new Error(`Duplicate component id: ${c.id}`);
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim()) throw new Error(`Invalid component name: ${c.id}`);
    if (!COMPONENT_TYPES.has(c.type)) throw new Error(`Invalid component type: ${c.id}`);
    if (!Array.isArray(c.requirement_refs) || c.requirement_refs.length === 0) throw new Error(`Missing requirement_refs: ${c.id}`);
  }
  const connIds = new Set<string>();
  for (const c of draft.connections ?? []) {
    if (!c || typeof c.id !== 'string' || !c.id) throw new Error('Invalid connection id');
    if (connIds.has(c.id) || ids.has(c.id)) throw new Error(`Duplicate id: ${c.id}`);
    connIds.add(c.id);
    if (!ids.has(c.from) || !ids.has(c.to)) throw new Error(`Invalid connection endpoints: ${c.id}`);
    if (!CONNECTION_TYPES.has(c.type)) throw new Error(`Invalid connection type: ${c.id}`);
    if (typeof c.label !== 'string') throw new Error(`Invalid connection label: ${c.id}`);
    if (!Array.isArray(c.requirement_refs) || c.requirement_refs.length === 0) throw new Error(`Missing requirement_refs: ${c.id}`);
  }
  const groupIds = new Set<string>();
  for (const g of draft.groups ?? []) {
    if (!g || typeof g.id !== 'string' || !g.id) throw new Error('Invalid group id');
    if (groupIds.has(g.id) || ids.has(g.id) || connIds.has(g.id)) throw new Error(`Duplicate id: ${g.id}`);
    groupIds.add(g.id);
    if (typeof g.name !== 'string' || !g.name.trim()) throw new Error(`Invalid group name: ${g.id}`);
    if (!Array.isArray(g.members)) throw new Error(`Invalid group members: ${g.id}`);
    for (const m of g.members) if (!ids.has(m)) throw new Error(`Invalid group member: ${g.id} -> ${m}`);
  }
}

function applyOne(next: ArchitectureDraft, op: PatchOperation, used: Set<string>): void {
  const fallbackReq = next.requirements[0]?.id ?? 'req_1';
  switch (op.op) {
    case 'set_title':
      if (typeof op.name === 'string' && op.name.trim()) next.title = op.name.trim();
      break;
    case 'set_summary':
      if (typeof op.summary === 'string') next.summary = op.summary.trim();
      break;
    case 'add_component': {
      const raw = (op.component ?? {}) as Record<string, unknown>;
      const id = ensureId('cmp', raw.id, used);
      const component = normalizeComponent(raw, id, fallbackReq);
      next.components.push(component);
      const groupId = typeof raw.group_id === 'string' ? raw.group_id : (typeof (raw as any).groupId === 'string' ? (raw as any).groupId : null);
      if (groupId) {
        const g = (next.groups ?? []).find((x) => x.id === groupId);
        if (g && !g.members.includes(component.id)) g.members.push(component.id);
      }
      break;
    }
    case 'update_component': {
      if (!op.id) break;
      const idx = next.components.findIndex((c) => c.id === op.id);
      if (idx < 0) break;
      const patch = (op.patch ?? {}) as Record<string, unknown>;
      const prev = next.components[idx];
      next.components[idx] = normalizeComponent({ ...prev as any, ...patch, id: prev.id }, prev.id, fallbackReq, prev);
      if ('group_id' in patch || 'groupId' in patch) {
        const newGroupId = typeof patch.group_id === 'string' ? patch.group_id : (typeof (patch as any).groupId === 'string' ? (patch as any).groupId : null);
        for (const g of next.groups ?? []) g.members = g.members.filter((m) => m !== prev.id);
        if (newGroupId) {
          const ng = (next.groups ?? []).find((g) => g.id === newGroupId);
          if (ng && !ng.members.includes(prev.id)) ng.members.push(prev.id);
        }
      }
      break;
    }
    case 'remove_component': {
      if (!op.id) break;
      next.components = next.components.filter((c) => c.id !== op.id);
      next.connections = (next.connections ?? []).filter((c) => c.from !== op.id && c.to !== op.id);
      next.groups = (next.groups ?? []).map((g) => ({ ...g, members: g.members.filter((id) => id !== op.id) })).filter((g) => g.members.length > 0);
      break;
    }
    case 'add_connection': {
      const raw = (op.connection ?? {}) as Record<string, unknown>;
      const id = ensureId('cnx', raw.id, used);
      const conn = normalizeConnection(raw, id, fallbackReq);
      if (!next.components.some((c) => c.id === conn.from) || !next.components.some((c) => c.id === conn.to)) break;
      (next.connections ?? []).push(conn);
      break;
    }
    case 'update_connection': {
      if (!op.id) break;
      const conns: Connection[] = next.connections ?? [];
      const idx = conns.findIndex((c) => c.id === op.id);
      if (idx < 0) break;
      const prev = conns[idx];
      const patch = (op.patch ?? {}) as Record<string, unknown>;
      const updated = normalizeConnection({ ...prev as any, ...patch, id: prev.id }, prev.id, fallbackReq, prev);
      if (!next.components.some((c) => c.id === updated.from) || !next.components.some((c) => c.id === updated.to)) break;
      conns[idx] = updated;
      break;
    }
    case 'remove_connection':
      if (op.id) next.connections = (next.connections ?? []).filter((c) => c.id !== op.id);
      break;
    case 'add_group': {
      const raw = (op.group ?? {}) as Record<string, unknown>;
      const id = ensureId('grp', raw.id, used);
      const valid = new Set(next.components.map((c) => c.id));
      (next.groups ?? []).push(normalizeGroup(raw, id, valid));
      break;
    }
    case 'update_group': {
      if (!op.id) break;
      const groups: Group[] = next.groups ?? [];
      const idx = groups.findIndex((g) => g.id === op.id);
      if (idx < 0) break;
      const prev = groups[idx];
      const patch = (op.patch ?? {}) as Record<string, unknown>;
      const valid = new Set(next.components.map((c) => c.id));
      groups[idx] = normalizeGroup({ ...prev as any, ...patch, id: prev.id }, prev.id, valid, prev);
      break;
    }
    case 'remove_group':
      if (op.id) next.groups = (next.groups ?? []).filter((g) => g.id !== op.id);
      break;
    case 'bulk': {
      const ops = Array.isArray((op as any).operations) ? (op as any).operations as PatchOperation[] : [];
      for (const sub of ops) applyOne(next, sub, used);
      break;
    }
    default:
      break;
  }
}

export function applyPatchOperations(draft: ArchitectureDraft, operations: PatchOperation[]): ArchitectureDraft {
  const next = cloneDraft(draft);
  next.connections = next.connections ?? [];
  next.groups = next.groups ?? [];
  const used = new Set<string>([
    ...next.components.map((c) => c.id),
    ...(next.connections ?? []).map((c) => c.id),
    ...(next.groups ?? []).map((g) => g.id),
  ]);

  for (const op of operations) applyOne(next, op, used);

  next.connections = next.connections?.length ? next.connections : [];
  next.groups = next.groups?.length ? next.groups : [];
  validateDraft(next);
  return next;
}
