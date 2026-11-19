import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const OUT = resolve(process.cwd(), '..', 'docs', 'screenshots', 'step-5');
mkdirSync(OUT, { recursive: true });

async function loadDraft(name: string): Promise<{
  components: unknown[];
  connections?: unknown[];
  groups?: unknown[];
}> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), 'src', 'fixtures', `${name}.json`), 'utf8'),
  ) as { components: unknown[]; connections?: unknown[]; groups?: unknown[] };
}

interface FixtureCounts {
  components: number;
  connections: number;
  groups: number;
}

function counts(draft: {
  components: unknown[];
  connections?: unknown[];
  groups?: unknown[];
}): FixtureCounts {
  return {
    components: draft.components.length,
    connections: draft.connections?.length ?? 0,
    groups: draft.groups?.length ?? 0,
  };
}

const FIXTURES = {
  small: counts(await loadDraft('small_architecture')),
  full: counts(await loadDraft('full_coverage_architecture')),
  large: counts(await loadDraft('large_architecture')),
  broken: counts(await loadDraft('broken_architecture')),
};

async function pngSize(path: string): Promise<{ width: number; height: number }> {
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function openApp(
  page: Page,
  search: string,
  expected: FixtureCounts,
): Promise<{ transform: string | null; errors: string[] }> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto(`/${search}`);
  await page.waitForSelector('[data-layout-ready="true"]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);

  await page.waitForFunction(
    ({ components, connections }) =>
      document.querySelectorAll('[data-testid="component-node"]').length === components &&
      document.querySelectorAll('[data-testid="architecture-edge"]').length === connections,
    { components: expected.components, connections: expected.connections },
    { timeout: 60_000 },
  );

  expect(
    await page.locator('[data-testid="component-node"]').count(),
    'rendered component nodes',
  ).toBe(expected.components);
  expect(
    await page.locator('[data-testid="architecture-edge"]').count(),
    'rendered edges',
  ).toBe(expected.connections);
  expect(await page.locator('[data-testid="group-node"]').count(), 'rendered groups').toBe(
    expected.groups,
  );

  const transform = await page.locator('[data-testid="canvas"]').getAttribute('data-viewport-transform');
  return { transform, errors };
}

async function capture(page: Page, file: string): Promise<void> {
  const path = resolve(OUT, file);
  await page.screenshot({ path, fullPage: false, animations: 'disabled', caret: 'hide' });
  expect(await pngSize(path), `${file} dimensions`).toEqual({ width: 1600, height: 1000 });
}

test.describe('step 5 screenshots', () => {
  test('small-light.png', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=small&theme=light', FIXTURES.small);
    await capture(page, 'small-light.png');
    expect(errors).toEqual([]);
  });

  test('full-light.png', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=full&theme=light', FIXTURES.full);
    await capture(page, 'full-light.png');
    expect(errors).toEqual([]);
  });

  test('large-light.png', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=large&theme=light', FIXTURES.large);
    expect(await page.locator('[data-testid="component-node"]').count()).toBe(120);
    expect(await page.locator('[data-testid="architecture-edge"]').count()).toBe(300);
    await capture(page, 'large-light.png');
    expect(errors).toEqual([]);
  });

  test('large-light-zoom.png centres a component at zoom 1', async ({ page }) => {
    const { errors } = await openApp(
      page,
      '?fixture=large&theme=light&focus=cmp_000&zoom=1',
      FIXTURES.large,
    );
    const canvas = page.locator('[data-testid="canvas"]');
    await expect(canvas).toHaveAttribute('data-viewport-zoom', '1.0000');
    await capture(page, 'large-light-zoom.png');
    expect(errors).toEqual([]);
  });

  test('broken-issues-light.png shows the issues and adjustments panels', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=broken&theme=light', FIXTURES.broken);

    const issues = page.locator('[data-testid="issues-panel"]');
    const adjustments = page.locator('[data-testid="adjustments-panel"]');
    expect(await issues.locator('[data-testid="issue-row"]').count()).toBeGreaterThan(0);
    expect(await adjustments.locator('[data-testid="adjustment-row"]').count()).toBeGreaterThan(0);

    await issues.scrollIntoViewIfNeeded();
    await capture(page, 'broken-issues-light.png');
    expect(errors).toEqual([]);
  });

  test('locked-light.png disables the viewport and shows the lock indicator', async ({ page }) => {
    const { transform, errors } = await openApp(
      page,
      '?fixture=small&theme=light&locked=1',
      FIXTURES.small,
    );
    expect(transform).not.toBeNull();
    await expect(page.locator('[data-testid="lock-indicator"]')).toHaveText(
      'Locked while the agent runs',
    );
    await expect(page.locator('[data-testid="canvas"]')).toHaveAttribute('data-pan', '0');

    await page.mouse.move(700, 500);
    await page.mouse.down();
    await page.mouse.move(1000, 750, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('[data-testid="canvas"]')).toHaveAttribute(
      'data-viewport-transform',
      transform ?? '',
    );

    await capture(page, 'locked-light.png');
    expect(errors).toEqual([]);
  });

  test('small-dark.png', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=small&theme=dark', FIXTURES.small);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, 'small-dark.png');
    expect(errors).toEqual([]);
  });

  test('full-dark.png', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=full&theme=dark', FIXTURES.full);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, 'full-dark.png');
    expect(errors).toEqual([]);
  });

  test('large-dark.png', async ({ page }) => {
    const { errors } = await openApp(page, '?fixture=large&theme=dark', FIXTURES.large);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, 'large-dark.png');
    expect(errors).toEqual([]);
  });
});
