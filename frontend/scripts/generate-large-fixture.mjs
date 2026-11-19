#!/usr/bin/env node
/**
 * Deterministic 120-component / 300-connection stress fixture.
 *
 * Fixed seed-free arithmetic only: running this script twice must produce
 * byte-identical JSON. The fixture is a stress case, not a validity case.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/fixtures/large_architecture.json');

const TYPES = [
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
];

const LABELS = {
  client: 'Web Client',
  api_gateway: 'API Gateway',
  load_balancer: 'Load Balancer',
  service: 'Service',
  worker: 'Worker',
  database: 'Database',
  cache: 'Cache',
  message_queue: 'Message Queue',
  object_storage: 'Object Storage',
  cdn: 'CDN',
  auth_provider: 'Auth Provider',
  search_index: 'Search Index',
  scheduler: 'Scheduler',
  external_service: 'External Service',
};

const TECHNOLOGIES = {
  client: 'React',
  api_gateway: 'Kong',
  load_balancer: 'HAProxy',
  service: 'FastAPI',
  worker: 'Celery',
  database: 'PostgreSQL',
  cache: 'Redis',
  message_queue: 'Kafka',
  object_storage: 'S3',
  cdn: 'CloudFront',
  auth_provider: 'Auth0',
  search_index: 'OpenSearch',
  scheduler: 'Temporal',
  external_service: 'Stripe',
};

export function build() {
  const requirements = [
    {
      id: 'req_scale',
      text: 'The platform serves a large multi-tenant workload with predictable behaviour under load.',
      kind: 'non_functional',
      source: 'prompt',
    },
  ];

  const components = [];
  for (let i = 0; i < 120; i += 1) {
    const type = TYPES[i % TYPES.length];
    components.push({
      id: `cmp_${String(i).padStart(3, '0')}`,
      type,
      name: `${LABELS[type]} ${String(i).padStart(3, '0')}`,
      technology: TECHNOLOGIES[type],
      description: `Stress-fixture ${type} number ${i}, used to measure deterministic layout at scale.`,
      attributes: {},
      requirement_refs: ['req_scale'],
      assumed: false,
      rationale: null,
    });
  }

  const pairs = [];
  for (let offset = 1; offset < 120 && pairs.length < 300; offset += 1) {
    for (let i = 0; i < 120 && pairs.length < 300; i += 1) {
      const to = (i + offset) % 120;
      if (to !== i) {
        pairs.push([i, to]);
      }
    }
  }

  const connections = pairs.map(([from, to], index) => ({
    id: `cnx_${String(index).padStart(4, '0')}`,
    from: `cmp_${String(from).padStart(3, '0')}`,
    to: `cmp_${String(to).padStart(3, '0')}`,
    type: index % 3 === 0 ? 'async' : 'sync',
    label: `link ${index}`,
    technology: index % 2 === 0 ? 'http' : 'tcp',
    requirement_refs: ['req_scale'],
    assumed: false,
    rationale: null,
  }));

  const groups = [];
  for (let g = 0; g < 6; g += 1) {
    groups.push({
      id: `grp_${String(g).padStart(2, '0')}`,
      name: `Tier ${g}`,
      description: `Deployment tier ${g} of the stress fixture.`,
      members: Array.from({ length: 20 }, (_, i) => `cmp_${String(g * 20 + i).padStart(3, '0')}`),
      parent_id: null,
      requirement_refs: ['req_scale'],
      assumed: false,
      rationale: null,
    });
  }

  return {
    title: 'Large Stress Architecture',
    summary:
      'A deterministic 120-component, 300-connection fixture. It exists to measure layout time and rendering under load; it is not a design review target.',
    requirements,
    components,
    connections,
    groups,
    assumptions: [],
    flags: [],
  };
}

export function serialize(fixture = build()) {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

async function main() {
  const fixture = build();
  const text = serialize(fixture);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, text, 'utf8');
  process.stdout.write(
    `wrote ${OUT}: ${fixture.components.length} components, ${fixture.connections.length} connections, ${fixture.groups.length} groups\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
