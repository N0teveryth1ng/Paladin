#!/usr/bin/env node
/**
 * Run the one-way fixture issue exporter under the backend virtualenv.
 *
 * This is a dev-only script. The frontend runtime never calls Python and never
 * imports the validators.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const REPO = resolve(FRONTEND, '..');

const candidates = [
  resolve(REPO, 'backend/.venv/Scripts/python.exe'),
  resolve(REPO, 'backend/.venv/bin/python'),
  resolve(REPO, 'backend/.venv/bin/python3'),
];

const python = candidates.find((candidate) => existsSync(candidate));
if (!python) {
  process.stderr.write(
    `backend virtualenv not found. Looked for:\n${candidates.join('\n')}\n`,
  );
  process.exit(1);
}

const fixtures = [
  'small_architecture',
  'full_coverage_architecture',
  'broken_architecture',
  'large_architecture',
];

const result = spawnSync(python, [resolve(HERE, 'export-fixture-issues.py'), ...fixtures], {
  cwd: FRONTEND,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
