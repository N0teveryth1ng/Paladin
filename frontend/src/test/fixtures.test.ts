import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { build, serialize } from '../../scripts/generate-large-fixture.mjs';
import type { ArchitectureDraft } from '../layout/layoutTypes';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');
const REPO = resolve(FRONTEND, '..');
const FIXTURES = resolve(FRONTEND, 'src/fixtures');
const BACKEND_FIXTURES = resolve(REPO, 'backend/tests/fixtures');

const COMPONENT_TYPES = [
  'client',
  'api_gateway',
  'load_balancer',
  'service',
  'worker',
  'database',
  'cache',
  'message_queue',
  'object_storage',
  'cdn',
  'auth_provider',
  'search_index',
  'scheduler',
  'external_service',
] as const;

const CONNECTION_TYPES = ['sync', 'async'] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function assertDraftShape(draft: ArchitectureDraft): void {
  expect(typeof draft.title).toBe('string');
  expect(typeof draft.summary).toBe('string');
  expect(Array.isArray(draft.requirements)).toBe(true);
  expect(Array.isArray(draft.components)).toBe(true);

  const componentIds = new Set<string>();
  for (const component of draft.components) {
    expect(typeof component.id).toBe('string');
    expect(component.id.length).toBeGreaterThan(0);
    expect(COMPONENT_TYPES).toContain(component.type);
    expect(typeof component.name).toBe('string');
    expect(typeof component.technology).toBe('string');
    expect(typeof component.description).toBe('string');
    expect(component.attributes).toBeTypeOf('object');
    for (const value of Object.values(component.attributes ?? {})) {
      expect(typeof value).toBe('string');
    }
    expect(Array.isArray(component.requirement_refs)).toBe(true);
    expect(typeof component.assumed).toBe('boolean');
    expect(component.rationale === null || typeof component.rationale === 'string').toBe(true);
    expect(componentIds.has(component.id)).toBe(false);
    componentIds.add(component.id);
  }

  const connectionIds = new Set<string>();
  for (const connection of draft.connections ?? []) {
    expect(typeof connection.id).toBe('string');
    expect(CONNECTION_TYPES).toContain(connection.type);
    expect(typeof connection.label).toBe('string');
    expect(typeof connection.from).toBe('string');
    expect(typeof connection.to).toBe('string');
    expect(typeof connection.technology).toBe('string');
    expect(Array.isArray(connection.requirement_refs)).toBe(true);
    expect(typeof connection.assumed).toBe('boolean');
    expect(connection.rationale === null || typeof connection.rationale === 'string').toBe(true);
    expect(connectionIds.has(connection.id)).toBe(false);
    connectionIds.add(connection.id);
  }

  const groupIds = new Set<string>();
  for (const group of draft.groups ?? []) {
    expect(typeof group.id).toBe('string');
    expect(typeof group.name).toBe('string');
    expect(typeof group.description).toBe('string');
    expect(Array.isArray(group.members)).toBe(true);
    expect(group.parent_id === null || typeof group.parent_id === 'string').toBe(true);
    expect(Array.isArray(group.requirement_refs)).toBe(true);
    expect(typeof group.assumed).toBe('boolean');
    expect(groupIds.has(group.id)).toBe(false);
    groupIds.add(group.id);
  }

  for (const requirement of draft.requirements) {
    expect(typeof requirement.id).toBe('string');
    expect(typeof requirement.text).toBe('string');
    expect(['functional', 'non_functional', 'constraint']).toContain(requirement.kind);
    expect(['prompt', 'assumption']).toContain(requirement.source);
  }
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

describe('committed fixtures', () => {
  it('copies the two backend fixtures byte for byte', async () => {
    for (const name of ['small_architecture.json', 'full_coverage_architecture.json']) {
      const frontend = await readFile(resolve(FIXTURES, name));
      const backend = await readFile(resolve(BACKEND_FIXTURES, name));
      expect(sha256(frontend)).toBe(sha256(backend));
    }
  });

  it('regenerates the large fixture byte for byte with the approved counts and coverage', async () => {
    const committed = await readFile(resolve(FIXTURES, 'large_architecture.json'), 'utf8');
    expect(serialize(build())).toBe(committed);

    const draft = JSON.parse(committed) as ArchitectureDraft;
    expect(draft.components).toHaveLength(120);
    expect(draft.connections).toHaveLength(300);
    expect(draft.groups).toHaveLength(6);

    const types = new Set(draft.components.map((component) => component.type));
    expect([...types].sort()).toEqual([...COMPONENT_TYPES].sort());

    const connectionTypes = new Set((draft.connections ?? []).map((connection) => connection.type));
    expect([...connectionTypes].sort()).toEqual([...CONNECTION_TYPES].sort());
  });

  it('keeps the broken fixture schema-valid and carries every malformed case', async () => {
    const draft = await readJson<ArchitectureDraft>(resolve(FIXTURES, 'broken_architecture.json'));
    expect(() => assertDraftShape(draft)).not.toThrow();

    const groups = draft.groups ?? [];
    const connections = draft.connections ?? [];
    const groupIds = new Set(groups.map((group) => group.id));

    const membership = new Map<string, string[]>();
    for (const group of groups) {
      for (const member of group.members) {
        const ids = membership.get(member) ?? [];
        ids.push(group.id);
        membership.set(member, ids);
      }
    }
    expect([...membership.values()].some((ids) => ids.length > 1)).toBe(true);

    const parentById = new Map(groups.map((group) => [group.id, group.parent_id ?? null]));
    expect(
      groups.some((group) => {
        const parent = group.parent_id;
        return parent !== null && parent !== undefined && (parentById.get(parent) ?? null) !== null;
      }),
    ).toBe(true);
    expect(
      groups.some(
        (group) =>
          group.parent_id !== null &&
          group.parent_id !== undefined &&
          !groupIds.has(group.parent_id),
      ),
    ).toBe(true);

    expect(connections.some((connection) => connection.from === connection.to)).toBe(true);

    const pairs = new Map<string, number>();
    for (const connection of connections) {
      const key = `${connection.from}->${connection.to}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    expect([...pairs.values()].some((count) => count > 1)).toBe(true);

    const componentNames = draft.components.map((component) => component.name);
    expect(new Set(componentNames).size).toBeLessThan(componentNames.length);
    const connectionLabels = connections.map((connection) => connection.label);
    expect(new Set(connectionLabels).size).toBeLessThan(connectionLabels.length);
    const groupNames = groups.map((group) => group.name);
    expect(new Set(groupNames).size).toBeLessThan(groupNames.length);

    const artifact = await readJson<{
      fixture: string;
      rules_version: string;
      issues: { severity: string; kind: string }[];
    }>(resolve(FIXTURES, 'issues/broken_architecture.issues.json'));
    expect(artifact.fixture).toBe('broken_architecture.json');
    expect(artifact.rules_version).toBe('1.1');
    expect(artifact.issues.length).toBeGreaterThan(0);
    expect(artifact.issues.some((issue) => issue.severity === 'invalid')).toBe(true);
    expect(artifact.issues.some((issue) => issue.severity === 'judgment')).toBe(true);
    expect(
      artifact.issues.some((issue) =>
        ['component_in_multiple_groups', 'group_nesting_too_deep', 'unknown_group_parent'].includes(
          issue.kind,
        ),
      ),
    ).toBe(true);
  });

  it('contains no model-level geometry keys', async () => {
    for (const name of [
      'small_architecture.json',
      'full_coverage_architecture.json',
      'large_architecture.json',
      'broken_architecture.json',
    ]) {
      const draft = await readJson<unknown>(resolve(FIXTURES, name));
      const keys: string[] = [];
      findGeometryKeys(draft, name, keys);
      expect(keys).toEqual([]);
    }
  });

  it('keeps every issue artifact to the display contract', async () => {
    for (const name of [
      'small_architecture',
      'full_coverage_architecture',
      'large_architecture',
      'broken_architecture',
    ]) {
      const artifact = await readJson<Record<string, unknown>>(
        resolve(FIXTURES, `issues/${name}.issues.json`),
      );
      expect(Object.keys(artifact).sort()).toEqual(['fixture', 'issues', 'rules_version']);
      expect(artifact.fixture).toBe(`${name}.json`);
      expect(artifact.rules_version).toBe('1.1');
      const issues = artifact.issues as Record<string, unknown>[];
      expect(Array.isArray(issues)).toBe(true);
      for (const issue of issues) {
        expect(Object.keys(issue).sort()).toEqual(['element_id', 'kind', 'message', 'severity']);
        expect(['invalid', 'judgment']).toContain(issue.severity);
        expect(typeof issue.kind).toBe('string');
        expect(typeof issue.message).toBe('string');
        expect(issue.element_id === null || typeof issue.element_id === 'string').toBe(true);
      }
    }
  });
});
