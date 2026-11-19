import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface Lockfile {
  lockfileVersion: number;
  packages: Record<
    string,
    {
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
  >;
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

describe('dependency and source policy', () => {
  it('pins every direct dependency to an exact version', async () => {
    const pkg = JSON.parse(await readFile(resolve(FRONTEND, 'package.json'), 'utf8')) as PackageJson;
    const direct = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(Object.keys(direct).length).toBeGreaterThan(0);

    for (const [name, version] of Object.entries(direct)) {
      expect(version, `${name} must be exact`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(version).not.toBe('latest');
      expect(version).not.toMatch(/^(git|file|link|workspace):/);
    }
  });

  it('commits a lockfile whose root versions match package.json', async () => {
    const pkg = JSON.parse(await readFile(resolve(FRONTEND, 'package.json'), 'utf8')) as PackageJson;
    const lock = JSON.parse(
      await readFile(resolve(FRONTEND, 'package-lock.json'), 'utf8'),
    ) as Lockfile;

    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
    const root = lock.packages[''];
    expect(root).toBeDefined();
    expect(root.dependencies ?? {}).toEqual(pkg.dependencies ?? {});
    expect(root.devDependencies ?? {}).toEqual(pkg.devDependencies ?? {});

    for (const [name, version] of Object.entries({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    })) {
      const installed = lock.packages[`node_modules/${name}`];
      expect(installed, `${name} is missing from the lockfile`).toBeDefined();
      expect(installed.version).toBe(version);
    }
  });

  it('carries no HTTP client, model SDK, or state-persistence dependency', async () => {
    const pkg = JSON.parse(await readFile(resolve(FRONTEND, 'package.json'), 'utf8')) as PackageJson;
    const names = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    const forbidden = [
      'axios',
      'node-fetch',
      'undici',
      'got',
      'superagent',
      'openai',
      '@anthropic-ai/sdk',
      '@google/generative-ai',
      'langchain',
      'redux',
      'zustand',
      'mobx',
      'localforage',
      'idb',
      'dexie',
    ];
    expect(forbidden.filter((name) => names.has(name))).toEqual([]);
  });

  it('keeps runtime source free of network, model, validator and process access', async () => {
    const files = (await walk(resolve(FRONTEND, 'src'))).filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        !file.includes(`${join('src', 'test')}`) &&
        !file.includes(`${join('src', 'fixtures')}`),
    );

    const forbidden = [
      'fetch(',
      'XMLHttpRequest',
      'axios',
      'localhost',
      '127.0.0.1',
      'validate_graph',
      'app.validation',
      'child_process',
      'openai',
      'anthropic',
      'openrouter',
      'generative-ai',
    ];

    const offenders: string[] = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const token of forbidden) {
        if (text.includes(token)) {
          offenders.push(`${file}: ${token}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
