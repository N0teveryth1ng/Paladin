import type {
  AdjustmentKind,
  ArchitectureDraft,
  Connection,
  LayoutAdjustment,
  NormalizedDraft,
  NormalizedGroup,
} from './layoutTypes';

/**
 * Deterministic normalisation of schema-valid drafts that break the soft rules.
 *
 * The draft is never mutated. Every dropped or adjusted item produces a note
 * that the side panel shows. Input array order never affects the result:
 * components, connections and groups are sorted by id, and group membership is
 * resolved by sorted group id.
 */

const NOTE_LIMIT = 400;

const CATEGORY: Record<AdjustmentKind, number> = {
  'group-parent': 1,
  'group-membership': 2,
  'unknown-member': 3,
  'empty-group': 4,
  'unknown-endpoint': 5,
  'self-loop': 6,
  'parallel-edges': 7,
  'duplicate-component-name': 8,
  'duplicate-connection-label': 9,
  'duplicate-group-name': 10,
};

interface RawNote {
  category: number;
  kind: AdjustmentKind;
  message: string;
  elementIds: string[];
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function splitMessage(message: string): string[] {
  if (message.length <= NOTE_LIMIT) {
    return [message];
  }

  const chunks: string[] = [];
  let rest = message;
  while (rest.length > NOTE_LIMIT) {
    let cut = rest.lastIndexOf(' ', NOTE_LIMIT - 20);
    if (cut < NOTE_LIMIT / 2) {
      cut = NOTE_LIMIT - 20;
    }
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) {
    chunks.push(rest);
  }

  return chunks.map((chunk, index) => `[part ${index + 1}/${chunks.length}] ${chunk}`);
}

class Notes {
  private readonly raw: RawNote[] = [];

  add(category: number, kind: AdjustmentKind, message: string, elementIds: string[]): void {
    const ids = [...elementIds].sort();
    for (const chunk of splitMessage(message)) {
      this.raw.push({ category, kind, message: chunk, elementIds: ids });
    }
  }

  finish(): LayoutAdjustment[] {
    return this.raw
      .slice()
      .sort((a, b) => {
        if (a.category !== b.category) return a.category - b.category;
        const aId = a.elementIds[0] ?? '';
        const bId = b.elementIds[0] ?? '';
        if (aId !== bId) return aId < bId ? -1 : 1;
        if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
        return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
      })
      .map(({ kind, message, elementIds }) => ({ kind, message, elementIds }));
  }
}

export function normalizeDraft(draft: ArchitectureDraft): NormalizedDraft {
  const notes = new Notes();

  const components = [...draft.components].sort(byId);
  const connectionsIn = [...(draft.connections ?? [])].sort(byId);
  const groupsIn = [...(draft.groups ?? [])].sort(byId);

  const componentById = new Map(components.map((component) => [component.id, component]));
  const groupById = new Map(groupsIn.map((group) => [group.id, group]));

  // 1. Group parent normalisation. At most one level survives.
  const parentOf = new Map<string, string | null>();
  for (const group of groupsIn) {
    const parentId = group.parent_id ?? null;
    if (parentId === null) {
      parentOf.set(group.id, null);
      continue;
    }

    if (parentId === group.id) {
      notes.add(
        CATEGORY['group-parent'],
        'group-parent',
        `group '${group.id}' names itself as parent; treated as top level`,
        [group.id],
      );
      parentOf.set(group.id, null);
      continue;
    }

    const parent = groupById.get(parentId);
    if (parent === undefined) {
      notes.add(
        CATEGORY['group-parent'],
        'group-parent',
        `group '${group.id}' names missing parent '${parentId}'; treated as top level`,
        [group.id],
      );
      parentOf.set(group.id, null);
      continue;
    }

    if ((parent.parent_id ?? null) !== null) {
      notes.add(
        CATEGORY['group-parent'],
        'group-parent',
        `group '${group.id}' was flattened to top level: parent '${parentId}' is itself nested (v1 allows one level)`,
        [group.id],
      );
      parentOf.set(group.id, null);
      continue;
    }

    parentOf.set(group.id, parentId);
  }

  // 2. Membership. A component in more than one group stays in the first
  //    group by sorted id; unknown members are skipped.
  const membership = new Map<string, string[]>();
  for (const group of groupsIn) {
    for (const member of group.members) {
      if (!componentById.has(member)) {
        notes.add(
          CATEGORY['unknown-member'],
          'unknown-member',
          `group '${group.id}' lists unknown component '${member}'; the member was skipped`,
          [group.id, member],
        );
        continue;
      }
      const groups = membership.get(member) ?? [];
      groups.push(group.id);
      membership.set(member, groups);
    }
  }

  const memberOf = new Map<string, string>();
  for (const component of components) {
    const groups = (membership.get(component.id) ?? []).slice().sort();
    if (groups.length === 0) {
      continue;
    }
    const chosen = groups[0];
    memberOf.set(component.id, chosen);
    if (groups.length > 1) {
      const dropped = groups.slice(1);
      notes.add(
        CATEGORY['group-membership'],
        'group-membership',
        `component '${component.id}' is listed in groups [${groups
          .map((id) => `'${id}'`)
          .join(', ')}]; assigned to '${chosen}' and removed from [${dropped
          .map((id) => `'${id}'`)
          .join(', ')}]`,
        [component.id, ...groups],
      );
    }
  }

  const membersByGroup = new Map<string, string[]>();
  for (const group of groupsIn) {
    membersByGroup.set(
      group.id,
      group.members
        .filter((member) => memberOf.get(member) === group.id)
        .slice()
        .sort(),
    );
  }

  // A group survives when it has a usable member or at least one surviving
  // child group. After parent normalisation the tree is at most one level
  // deep, so a child group never has children of its own.
  const childGroups = new Map<string, string[]>();
  for (const group of groupsIn) {
    const parentId = parentOf.get(group.id) ?? null;
    if (parentId === null) {
      continue;
    }
    const children = childGroups.get(parentId) ?? [];
    children.push(group.id);
    childGroups.set(parentId, children);
  }

  const keptIds = new Set<string>();
  for (const group of groupsIn) {
    const members = membersByGroup.get(group.id) ?? [];
    const children = childGroups.get(group.id) ?? [];
    const hasKeptChild = children.some(
      (childId) => (membersByGroup.get(childId) ?? []).length > 0,
    );
    if (members.length > 0 || hasKeptChild) {
      keptIds.add(group.id);
    }
  }

  const keptGroups: NormalizedGroup[] = [];
  for (const group of groupsIn) {
    if (!keptIds.has(group.id)) {
      notes.add(
        CATEGORY['empty-group'],
        'empty-group',
        `group '${group.id}' has no usable members or child groups; omitted from the layout`,
        [group.id],
      );
      continue;
    }

    keptGroups.push({
      id: group.id,
      name: group.name,
      description: group.description,
      assumed: group.assumed,
      rationale: group.rationale ?? null,
      requirement_refs: [...(group.requirement_refs ?? [])],
      parentId: parentOf.get(group.id) ?? null,
      members: membersByGroup.get(group.id) ?? [],
      source: group,
    });
  }

  // 3. Connections with both endpoints present are kept, including self-loops
  //    and parallel edges.
  const connections: Connection[] = [];
  const pairMap = new Map<string, string[]>();
  for (const connection of connectionsIn) {
    if (!componentById.has(connection.from) || !componentById.has(connection.to)) {
      notes.add(
        CATEGORY['unknown-endpoint'],
        'unknown-endpoint',
        `connection '${connection.id}' has an unknown endpoint ('${connection.from}' -> '${connection.to}'); skipped`,
        [connection.id],
      );
      continue;
    }

    connections.push(connection);

    if (connection.from === connection.to) {
      notes.add(
        CATEGORY['self-loop'],
        'self-loop',
        `connection '${connection.id}' is a self-loop on '${connection.from}'; drawn as a visible loop`,
        [connection.id],
      );
    }

    const pair = `${connection.from}->${connection.to}`;
    const ids = pairMap.get(pair) ?? [];
    ids.push(connection.id);
    pairMap.set(pair, ids);
  }

  for (const [pair, ids] of [...pairMap.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (ids.length > 1) {
      const sorted = ids.slice().sort();
      notes.add(
        CATEGORY['parallel-edges'],
        'parallel-edges',
        `connections ${sorted.map((id) => `'${id}'`).join(', ')} share the pair ${pair}; all are drawn as separate paths`,
        sorted,
      );
    }
  }

  // 4. Duplicate labels are legal. They are reported, never merged.
  reportDuplicates(
    notes,
    components.map((component) => ({ id: component.id, label: component.name })),
    'duplicate-component-name',
    'component name',
  );
  reportDuplicates(
    notes,
    connections.map((connection) => ({ id: connection.id, label: connection.label })),
    'duplicate-connection-label',
    'connection label',
  );
  reportDuplicates(
    notes,
    keptGroups.map((group) => ({ id: group.id, label: group.name })),
    'duplicate-group-name',
    'group name',
  );

  return {
    components,
    connections,
    groups: keptGroups,
    adjustments: notes.finish(),
  };
}

function reportDuplicates(
  notes: Notes,
  items: { id: string; label: string }[],
  kind: AdjustmentKind,
  what: string,
): void {
  const byLabel = new Map<string, string[]>();
  for (const item of items) {
    const ids = byLabel.get(item.label) ?? [];
    ids.push(item.id);
    byLabel.set(item.label, ids);
  }

  for (const [label, ids] of [...byLabel.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (ids.length > 1) {
      const sorted = ids.slice().sort();
      notes.add(
        CATEGORY[kind],
        kind,
        `${what} '${label}' is used by ${sorted.length} elements: ${sorted
          .map((id) => `'${id}'`)
          .join(', ')}; all are kept`,
        sorted,
      );
    }
  }
}
