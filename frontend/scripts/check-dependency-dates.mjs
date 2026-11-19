#!/usr/bin/env node
/**
 * Report every direct dependency's exact version and publish date, and fail
 * when a selected version was published less than 14 days ago.
 *
 * Reads package.json and the npm registry. It never installs or upgrades.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(resolve(HERE, '../package.json'), 'utf8'));
const CUTOFF_DAYS = 14;
const cutoff = Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000;

const entries = [
  ...Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({ name, version, kind: 'dependency' })),
  ...Object.entries(pkg.devDependencies ?? {}).map(([name, version]) => ({ name, version, kind: 'devDependency' })),
];

const rows = [];
let tooNew = 0;

for (const entry of entries) {
  if (!/^\d+\.\d+\.\d+$/.test(entry.version)) {
    rows.push({ ...entry, date: 'NOT EXACT', ok: false });
    tooNew += 1;
    continue;
  }

  const url = `https://registry.npmjs.org/${entry.name.replace('/', '%2f')}`;
  const response = await fetch(url);
  if (!response.ok) {
    rows.push({ ...entry, date: `HTTP ${response.status}`, ok: false });
    tooNew += 1;
    continue;
  }

  const meta = await response.json();
  const published = meta.time?.[entry.version];
  if (!published) {
    rows.push({ ...entry, date: 'NOT PUBLISHED', ok: false });
    tooNew += 1;
    continue;
  }

  const publishedMs = Date.parse(published);
  const ageDays = (Date.now() - publishedMs) / (24 * 60 * 60 * 1000);
  const ok = publishedMs < cutoff;
  if (!ok) {
    tooNew += 1;
  }
  rows.push({
    ...entry,
    date: published.slice(0, 10),
    ageDays: ageDays.toFixed(1),
    ok,
  });
}

for (const row of rows) {
  const status = row.ok ? 'ok' : 'TOO NEW';
  process.stdout.write(
    `${row.kind.padEnd(13)} ${row.name.padEnd(32)} ${String(row.version).padEnd(12)} ${row.date.padEnd(12)} ${status}\n`,
  );
}

if (tooNew > 0) {
  process.stderr.write(
    `\n${tooNew} direct dependency version(s) are not older than ${CUTOFF_DAYS} days.\n`,
  );
  process.exit(1);
}

process.stdout.write(`\nall ${rows.length} direct dependencies are older than ${CUTOFF_DAYS} days\n`);
