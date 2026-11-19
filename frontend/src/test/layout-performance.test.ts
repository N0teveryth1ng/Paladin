import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { layoutArchitecture } from '../layout/layout';
import type { ArchitectureDraft } from '../layout/layoutTypes';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../fixtures');

async function readDraft(name: string): Promise<ArchitectureDraft> {
  return JSON.parse(await readFile(resolve(FIXTURES, `${name}.json`), 'utf8')) as ArchitectureDraft;
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

describe('layout performance', () => {
  it('lays out the 120/300 fixture within the pre-registered bounds', async () => {
    const draft = await readDraft('large_architecture');
    const timings: number[] = [];

    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      const result = await layoutArchitecture(draft);
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      console.log(
        `large run ${run + 1}: ${elapsed.toFixed(1)} ms, ${result.nodes.length} nodes, ${result.edges.length} edges`,
      );
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const median = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const worst = sorted[sorted.length - 1];
    console.log(
      `large timings: [${timings.map((value) => value.toFixed(1)).join(', ')}] ms; median ${median.toFixed(
        1,
      )} ms; p95 ${p95.toFixed(1)} ms; worst ${worst.toFixed(1)} ms`,
    );

    expect(p95).toBeLessThan(2000);
    expect(worst).toBeLessThan(5000);
  });

  it('lays out the small and full fixtures under one second each', async () => {
    for (const name of ['small_architecture', 'full_coverage_architecture']) {
      const draft = await readDraft(name);
      const start = performance.now();
      const result = await layoutArchitecture(draft);
      const elapsed = performance.now() - start;
      console.log(`${name}: ${elapsed.toFixed(1)} ms, ${result.nodes.length} nodes, ${result.edges.length} edges`);
      expect(elapsed).toBeLessThan(1000);
    }
  });
});
