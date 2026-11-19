import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { layoutArchitecture } from '../layout/layout';
import type { ArchitectureDraft, LayoutNode, LayoutResult } from '../layout/layoutTypes';
import { GROUP_PADDING } from '../layout/nodeSizes';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');
const FIXTURES = resolve(FRONTEND, 'src/fixtures');
const EPSILON = 1e-6;

async function readDraft(name: string): Promise<ArchitectureDraft> {
  return JSON.parse(await readFile(resolve(FIXTURES, `${name}.json`), 'utf8')) as ArchitectureDraft;
}

async function layout(name: string): Promise<{ draft: ArchitectureDraft; result: LayoutResult }> {
  const draft = await readDraft(name);
  return { draft, result: await layoutArchitecture(draft) };
}

function overlaps(a: LayoutNode, b: LayoutNode): boolean {
  return (
    a.absoluteX < b.absoluteX + b.width - EPSILON &&
    b.absoluteX < a.absoluteX + a.width - EPSILON &&
    a.absoluteY < b.absoluteY + b.height - EPSILON &&
    b.absoluteY < a.absoluteY + a.height - EPSILON
  );
}

function ancestors(node: LayoutNode, byId: Map<string, LayoutNode>): string[] {
  const chain: string[] = [];
  let current = node.parentId;
  while (current !== null && current !== undefined) {
    chain.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return chain;
}

function related(a: LayoutNode, b: LayoutNode, byId: Map<string, LayoutNode>): boolean {
  return a.id === b.id || ancestors(a, byId).includes(b.id) || ancestors(b, byId).includes(a.id);
}

function findGeometryKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findGeometryKeys(item, `${path}[${index}]`, out));
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'attributes') {
      continue;
    }
    if (key === 'x' || key === 'y' || key === 'position' || key === 'width' || key === 'height') {
      out.push(`${path}.${key}`);
    }
    findGeometryKeys(child, `${path}.${key}`, out);
  }
}

describe('layoutArchitecture', () => {
  it('returns deep-equal results for two calls on the same fixture', async () => {
    const draft = await readDraft('small_architecture');
    const before = JSON.stringify(draft);
    const first = await layoutArchitecture(draft);
    const second = await layoutArchitecture(draft);
    expect(second).toEqual(first);
    expect(JSON.stringify(draft)).toBe(before);
  });

  it('produces the same SHA-256 in two separate Node processes', async () => {
    const script = resolve(FRONTEND, 'scripts/layout-hash.mjs');
    const run = (): string =>
      execFileSync(process.execPath, ['--import', 'tsx', script, 'small_architecture'], {
        cwd: FRONTEND,
        encoding: 'utf8',
      }).trim();

    const first = run();
    const second = run();
    expect(second).toBe(first);

    const draft = await readDraft('small_architecture');
    const result = await layoutArchitecture(draft);
    const inProcess = createHash('sha256').update(JSON.stringify(result)).digest('hex').toUpperCase();
    expect(first).toBe(inProcess);
  });

  it('never overlaps unrelated nodes, including groups and top-level nodes', async () => {
    for (const name of [
      'small_architecture',
      'full_coverage_architecture',
      'broken_architecture',
      'large_architecture',
    ]) {
      const { result } = await layout(name);
      const byId = new Map(result.nodes.map((node) => [node.id, node]));
      const collisions: string[] = [];
      for (let i = 0; i < result.nodes.length; i += 1) {
        for (let j = i + 1; j < result.nodes.length; j += 1) {
          const a = result.nodes[i];
          const b = result.nodes[j];
          if (related(a, b, byId)) {
            continue;
          }
          if (overlaps(a, b)) {
            collisions.push(`${name}: ${a.id} overlaps ${b.id}`);
          }
        }
      }
      expect(collisions).toEqual([]);
    }
  });

  it('keeps every edge endpoint valid and every normalised connection exactly once', async () => {
    for (const name of [
      'small_architecture',
      'full_coverage_architecture',
      'broken_architecture',
      'large_architecture',
    ]) {
      const { draft, result } = await layout(name);
      const componentIds = new Set(draft.components.map((component) => component.id));
      const edgeIds = new Set(result.edges.map((edge) => edge.id));
      expect(result.edges).toHaveLength((draft.connections ?? []).length);
      expect(edgeIds.size).toBe(result.edges.length);
      for (const edge of result.edges) {
        expect(componentIds.has(edge.from)).toBe(true);
        expect(componentIds.has(edge.to)).toBe(true);
        expect(edge.labelBox.width).toBeGreaterThan(0);
        expect(edge.labelBox.height).toBeGreaterThan(0);
      }
    }
  });

  it('contains every group member with the declared padding and at most one nesting level', async () => {
    for (const name of [
      'small_architecture',
      'full_coverage_architecture',
      'broken_architecture',
      'large_architecture',
    ]) {
      const { result } = await layout(name);
      const byId = new Map(result.nodes.map((node) => [node.id, node]));

      for (const node of result.nodes) {
        if (node.parentId === null) {
          continue;
        }
        const parent = byId.get(node.parentId);
        expect(parent).toBeDefined();
        if (parent === undefined) {
          continue;
        }
        expect(node.absoluteX).toBeGreaterThanOrEqual(parent.absoluteX + GROUP_PADDING.left - EPSILON);
        expect(node.absoluteY).toBeGreaterThanOrEqual(parent.absoluteY + GROUP_PADDING.top - EPSILON);
        expect(node.absoluteX + node.width).toBeLessThanOrEqual(
          parent.absoluteX + parent.width - GROUP_PADDING.right + EPSILON,
        );
        expect(node.absoluteY + node.height).toBeLessThanOrEqual(
          parent.absoluteY + parent.height - GROUP_PADDING.bottom + EPSILON,
        );
      }

      const groups = result.nodes.filter((node) => node.kind === 'group');
      for (const group of groups) {
        let depth = 0;
        let current = group.parentId;
        while (current !== null && current !== undefined) {
          depth += 1;
          current = byId.get(current)?.parentId ?? null;
        }
        expect(depth).toBeLessThanOrEqual(1);
      }

      const groupCollisions: string[] = [];
      for (let i = 0; i < groups.length; i += 1) {
        for (let j = i + 1; j < groups.length; j += 1) {
          if (!related(groups[i], groups[j], byId) && overlaps(groups[i], groups[j])) {
            groupCollisions.push(`${name}: ${groups[i].id} overlaps ${groups[j].id}`);
          }
        }
      }
      expect(groupCollisions).toEqual([]);
    }
  });

  it('skips and counts a dangling edge without throwing', async () => {
    const draft = await readDraft('small_architecture');
    const validConnections = (draft.connections ?? []).length;
    draft.connections = [
      ...(draft.connections ?? []),
      {
        id: 'cnx_dangling',
        from: 'cmp_web',
        to: 'cmp_missing',
        type: 'sync',
        label: 'dangling',
        technology: 'http',
        requirement_refs: [],
        assumed: true,
        rationale: 'Test-only dangling endpoint.',
      },
    ];

    const result = await layoutArchitecture(draft);
    expect(result.edges).toHaveLength(validConnections);
    const note = result.adjustments.find((adjustment) => adjustment.kind === 'unknown-endpoint');
    expect(note).toBeDefined();
    expect(note?.elementIds).toEqual(['cnx_dangling']);
    expect(note?.message).toContain('skipped');
  });

  it('keeps coordinates out of the draft and inside LayoutResult only', async () => {
    const { draft, result } = await layout('small_architecture');
    const draftKeys: string[] = [];
    findGeometryKeys(draft, 'draft', draftKeys);
    expect(draftKeys).toEqual([]);

    expect(typeof result.width).toBe('number');
    expect(typeof result.height).toBe('number');
    for (const node of result.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(typeof node.width).toBe('number');
      expect(typeof node.height).toBe('number');
      expect(typeof node.absoluteX).toBe('number');
      expect(typeof node.absoluteY).toBe('number');
    }
    for (const edge of result.edges) {
      expect(typeof edge.labelBox.x).toBe('number');
      expect(typeof edge.labelBox.y).toBe('number');
      expect(typeof edge.labelBox.width).toBe('number');
      expect(typeof edge.labelBox.height).toBe('number');
    }
  });
});
