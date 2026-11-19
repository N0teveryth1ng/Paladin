#!/usr/bin/env node
/**
 * Print the SHA-256 of a fixture's layout result.
 *
 * Two separate processes must print the same hash for the same fixture. This
 * is the cross-process determinism guard; it is run through tsx because the
 * layout module is TypeScript.
 *
 * Usage: npx tsx scripts/layout-hash.mjs <fixture-name>
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutArchitecture } from '../src/layout/layout.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? 'small_architecture';
const path = resolve(HERE, `../src/fixtures/${name}.json`);
const draft = JSON.parse(await readFile(path, 'utf8'));
const result = await layoutArchitecture(draft);
const text = JSON.stringify(result);
process.stdout.write(`${createHash('sha256').update(text).digest('hex').toUpperCase()}\n`);
