import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, useEffect, useState } from 'react';

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { FixtureEntry, ThemeName } from '../app/modes';
import { layoutArchitecture } from '../layout/layout';
import type {
  ArchitectureDraft,
  Component,
  Connection,
  Group,
  LayoutResult,
} from '../layout/layoutTypes';
import { Canvas } from '../render/Canvas';
import { SidePanel } from '../render/SidePanel';
import type { IssuesArtifact } from '../types/issues';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../fixtures');

afterEach(cleanup);

function component(
  id: string,
  type: Component['type'],
  name: string,
  technology = 'test-tech',
): Component {
  return {
    id,
    type,
    name,
    technology,
    description: `${name} description.`,
    attributes: {},
    requirement_refs: ['req_1'],
    assumed: false,
    rationale: null,
  };
}

function connection(
  id: string,
  from: string,
  to: string,
  label: string,
  technology = 'http',
): Connection {
  return {
    id,
    from,
    to,
    type: 'sync',
    label,
    technology,
    requirement_refs: ['req_1'],
    assumed: false,
    rationale: null,
  };
}

function group(id: string, name: string, members: string[], parentId: string | null): Group {
  return {
    id,
    name,
    description: `${name} description.`,
    members,
    parent_id: parentId,
    requirement_refs: ['req_1'],
    assumed: false,
    rationale: null,
  };
}

function baseDraft(): ArchitectureDraft & {
  connections: Connection[];
  groups: Group[];
} {
  return {
    title: 'Malformed case',
    summary: 'A valid draft that receives exactly one malformation per test.',
    requirements: [
      {
        id: 'req_1',
        text: 'A requirement used by the test draft.',
        kind: 'functional',
        source: 'prompt',
      },
    ],
    components: [
      component('cmp_a', 'service', 'Service A'),
      component('cmp_b', 'database', 'Database B'),
      component('cmp_c', 'cache', 'Cache C'),
    ],
    connections: [
      connection('cnx_ab', 'cmp_a', 'cmp_b', 'reads'),
      connection('cnx_ac', 'cmp_a', 'cmp_c', 'looks up', 'tcp'),
    ],
    groups: [group('grp_root', 'Root Tier', ['cmp_a'], null)],
    assumptions: [],
    flags: [],
  };
}

function kinds(result: LayoutResult): string[] {
  return result.adjustments.map((adjustment) => adjustment.kind);
}

function groupAncestorDepth(result: LayoutResult, groupId: string): number {
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  let depth = 0;
  let current = byId.get(groupId)?.parentId ?? null;
  while (current !== null && current !== undefined) {
    depth += 1;
    current = byId.get(current)?.parentId ?? null;
  }
  return depth;
}

async function brokenDraft(): Promise<ArchitectureDraft> {
  return JSON.parse(
    await readFile(resolve(FIXTURES, 'broken_architecture.json'), 'utf8'),
  ) as ArchitectureDraft;
}

function emptyIssues(fixture: string): IssuesArtifact {
  return { fixture, rules_version: '1.1', issues: [] };
}

function Harness({
  draft,
  onResult,
}: {
  draft: ArchitectureDraft;
  onResult?: (result: LayoutResult) => void;
}) {
  const [result, setResult] = useState<LayoutResult | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    layoutArchitecture(draft).then((layout) => {
      if (alive) {
        setResult(layout);
        onResult?.(layout);
      }
    });
    return () => {
      alive = false;
    };
  }, [draft, onResult]);

  if (result === null) {
    return createElement('div', { 'data-testid': 'loading' });
  }

  const entry: FixtureEntry = {
    name: 'broken',
    label: draft.title,
    file: 'malformed-case.json',
    draft,
    issues: emptyIssues('malformed-case.json'),
  };

  const theme: ThemeName = 'light';

  return createElement(
    'div',
    { style: { position: 'relative', width: 1200, height: 800 } },
    createElement(
      'div',
      { style: { position: 'relative', width: 1200, height: 700 } },
      createElement(Canvas, {
        result,
        issues: [],
        theme,
        locked: false,
        focus: null,
        zoom: null,
        fitNonce: 0,
        fixtureName: entry.name,
        onSelect: () => {},
        onClearSelection: () => {},
        onReady: () => {},
      }),
    ),
    createElement(SidePanel, {
      entry,
      result,
      selection: null,
      onSelect: () => {},
      theme,
    }),
  );
}

async function renderDraft(draft: ArchitectureDraft): Promise<void> {
  render(createElement(Harness, { draft }));
  await waitFor(
    () => {
      expect(document.querySelector('[data-layout-ready="true"]')).not.toBeNull();
    },
    { timeout: 20000 },
  );
}

function noteKinds(): string[] {
  return [...document.querySelectorAll('[data-testid="adjustment-row"]')].map(
    (row) => row.getAttribute('data-kind') ?? '',
  );
}

describe('malformed drafts: layout', () => {
  it('assigns a component in two groups to the first sorted group and notes the drop', async () => {
    const draft = baseDraft();
    draft.groups.push(group('grp_extra', 'Extra Tier', ['cmp_a'], null));

    const result = await layoutArchitecture(draft);
    const node = result.nodes.find((candidate) => candidate.id === 'cmp_a');
    expect(node?.parentId).toBe('grp_extra');

    const memberships = result.nodes.filter(
      (candidate) => candidate.id === 'cmp_a' && candidate.parentId !== null,
    );
    expect(memberships).toHaveLength(1);

    const note = result.adjustments.find(
      (adjustment) => adjustment.kind === 'group-membership',
    );
    expect(note).toBeDefined();
    expect(note?.elementIds).toContain('cmp_a');
    expect(note?.message).toContain("assigned to 'grp_extra'");
  });

  it('flattens group nesting deeper than one level and notes it', async () => {
    const draft = baseDraft();
    draft.groups.push(group('grp_child', 'Child Tier', ['cmp_b'], 'grp_root'));
    draft.groups.push(group('grp_grand', 'Grandchild Tier', ['cmp_c'], 'grp_child'));

    const result = await layoutArchitecture(draft);
    const grand = result.nodes.find((candidate) => candidate.id === 'grp_grand');
    expect(grand?.parentId).toBeNull();
    expect(groupAncestorDepth(result, 'grp_grand')).toBe(0);

    for (const node of result.nodes) {
      if (node.kind === 'group') {
        expect(groupAncestorDepth(result, node.id)).toBeLessThanOrEqual(1);
      }
    }

    const note = result.adjustments.find(
      (adjustment) => adjustment.kind === 'group-parent' && adjustment.elementIds.includes('grp_grand'),
    );
    expect(note).toBeDefined();
    expect(note?.message).toContain('flattened');
  });

  it('treats a group with a missing parent as top level and notes it', async () => {
    const draft = baseDraft();
    draft.groups.push(group('grp_orphan', 'Orphan Tier', ['cmp_c'], 'grp_missing'));

    const result = await layoutArchitecture(draft);
    const orphan = result.nodes.find((candidate) => candidate.id === 'grp_orphan');
    expect(orphan?.parentId).toBeNull();

    const note = result.adjustments.find(
      (adjustment) =>
        adjustment.kind === 'group-parent' && adjustment.elementIds.includes('grp_orphan'),
    );
    expect(note).toBeDefined();
    expect(note?.message).toContain('missing parent');
  });

  it('keeps a self-loop, notes it, and gives it a drawable path', async () => {
    const draft = baseDraft();
    draft.connections.push(connection('cnx_self', 'cmp_a', 'cmp_a', 'internal retry'));

    const result = await layoutArchitecture(draft);
    const loop = result.edges.find((edge) => edge.id === 'cnx_self');
    expect(loop).toBeDefined();
    expect(loop?.from).toBe('cmp_a');
    expect(loop?.to).toBe('cmp_a');
    expect(loop?.labelBox.width).toBeGreaterThan(0);

    const note = result.adjustments.find((adjustment) => adjustment.kind === 'self-loop');
    expect(note?.elementIds).toEqual(['cnx_self']);
  });

  it('keeps parallel connections and reports both ids in one note', async () => {
    const draft = baseDraft();
    draft.connections.push(connection('cnx_ab_2', 'cmp_a', 'cmp_b', 'reads again'));

    const result = await layoutArchitecture(draft);
    expect(result.edges.filter((edge) => edge.from === 'cmp_a' && edge.to === 'cmp_b')).toHaveLength(2);

    const notes = result.adjustments.filter(
      (adjustment) => adjustment.kind === 'parallel-edges',
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].elementIds).toEqual(['cnx_ab', 'cnx_ab_2']);
  });

  it('keeps duplicate component names, connection labels and group names and notes each kind', async () => {
    const draft = baseDraft();
    draft.components[1].name = draft.components[0].name;
    draft.connections[1].label = draft.connections[0].label;
    draft.groups.push(group('grp_second', 'Root Tier', ['cmp_b'], null));

    const result = await layoutArchitecture(draft);
    expect(result.nodes.filter((node) => node.kind === 'component')).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.nodes.filter((node) => node.kind === 'group')).toHaveLength(2);

    expect(kinds(result)).toEqual(
      expect.arrayContaining([
        'duplicate-component-name',
        'duplicate-connection-label',
        'duplicate-group-name',
      ]),
    );
  });

  it('normalises the combined broken fixture without throwing, with every note kind and a stable order', async () => {
    const draft = await brokenDraft();
    const first = await layoutArchitecture(draft);
    const second = await layoutArchitecture(draft);

    expect(second.adjustments).toEqual(first.adjustments);
    expect([...new Set(kinds(first))].sort()).toEqual(
      [
        'duplicate-component-name',
        'duplicate-connection-label',
        'duplicate-group-name',
        'group-membership',
        'group-parent',
        'parallel-edges',
        'self-loop',
      ].sort(),
    );
    expect(first.nodes.filter((node) => node.kind === 'component')).toHaveLength(
      draft.components.length,
    );
    expect(first.edges).toHaveLength((draft.connections ?? []).length);
  });
});

describe('malformed drafts: render', () => {
  it('renders a component in two groups and shows the group-membership note', async () => {
    const draft = baseDraft();
    draft.groups.push(group('grp_extra', 'Extra Tier', ['cmp_a'], null));

    await renderDraft(draft);
    expect(document.querySelectorAll('[data-testid="component-node"]')).toHaveLength(3);
    expect(noteKinds()).toContain('group-membership');
  });

  it('renders deep group nesting and shows the group-parent note', async () => {
    const draft = baseDraft();
    draft.groups.push(group('grp_child', 'Child Tier', ['cmp_b'], 'grp_root'));
    draft.groups.push(group('grp_grand', 'Grandchild Tier', ['cmp_c'], 'grp_child'));

    await renderDraft(draft);
    expect(document.querySelectorAll('[data-testid="component-node"]')).toHaveLength(3);
    expect(noteKinds()).toContain('group-parent');
  });

  it('renders a missing group parent and shows the group-parent note', async () => {
    const draft = baseDraft();
    draft.groups.push(group('grp_orphan', 'Orphan Tier', ['cmp_c'], 'grp_missing'));

    await renderDraft(draft);
    expect(document.querySelectorAll('[data-testid="group-node"]').length).toBeGreaterThan(0);
    expect(noteKinds()).toContain('group-parent');
  });

  it('renders a self-loop and shows the self-loop note', async () => {
    const draft = baseDraft();
    draft.connections.push(connection('cnx_self', 'cmp_a', 'cmp_a', 'internal retry'));

    await renderDraft(draft);
    expect(document.querySelectorAll('[data-testid="architecture-edge"]')).toHaveLength(3);
    expect(document.querySelectorAll('.edge-label')).toHaveLength(3);
    expect(noteKinds()).toContain('self-loop');
  });

  it('renders parallel connections and shows the parallel-edges note', async () => {
    const draft = baseDraft();
    draft.connections.push(connection('cnx_ab_2', 'cmp_a', 'cmp_b', 'reads again'));

    await renderDraft(draft);
    expect(document.querySelectorAll('[data-testid="architecture-edge"]')).toHaveLength(3);
    expect(noteKinds()).toContain('parallel-edges');
  });

  it('renders duplicate labels and shows every duplicate-label note', async () => {
    const draft = baseDraft();
    draft.components[1].name = draft.components[0].name;
    draft.connections[1].label = draft.connections[0].label;
    draft.groups.push(group('grp_second', 'Root Tier', ['cmp_b'], null));

    await renderDraft(draft);
    const found = noteKinds();
    expect(found).toContain('duplicate-component-name');
    expect(found).toContain('duplicate-connection-label');
    expect(found).toContain('duplicate-group-name');
  });

  it('renders the combined broken fixture with every adjustment note and does not crash', async () => {
    const draft = await brokenDraft();
    await renderDraft(draft);

    expect(document.querySelectorAll('[data-testid="component-node"]')).toHaveLength(
      draft.components.length,
    );
    expect(document.querySelectorAll('[data-testid="architecture-edge"]')).toHaveLength(
      (draft.connections ?? []).length,
    );

    const found = noteKinds();
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found).size).toBeGreaterThanOrEqual(6);
  });
});
