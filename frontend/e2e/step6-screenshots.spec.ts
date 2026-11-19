import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * These screenshots drive the real frontend against a separately-running
 * fake-injected backend. Fetch is never stubbed in the browser.
 *
 * Expected test-only backend launcher (provided by the backend agent):
 *
 *   cd D:/Paladin/backend
 *   python -m tests.fixtures.api.launcher --scenario <name>
 *
 * Scenarios used here: running, issues, blocking, rate_limited. The launcher
 * must bind 127.0.0.1:8000, inject tests/fixtures/api/fake_client.py through
 * dependency overrides, and keep the "running" run active long enough to be
 * captured.
 */

const OUT = resolve(process.cwd(), '..', 'docs', 'screenshots', 'step-6');
mkdirSync(OUT, { recursive: true });

const BACKEND_CWD = resolve(process.cwd(), '..', 'backend');
const LAUNCHER_MODULE = 'tests.fixtures.api.launcher';
const HEALTH_URL = 'http://127.0.0.1:8000/api/health';
const RATE_LIMITED_MESSAGE =
  'Free-model daily limit reached (HTTP 429). No retry was made. Try again after the daily reset at 00:00 UTC.';

let backend: ChildProcess | null = null;
const backendOutput: string[] = [];

async function probe(): Promise<boolean> {
  try {
    await fetch(HEALTH_URL, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function waitForBackend(up: boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await probe()) === up) {
      return;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(
    `fake backend did not reach ${up ? 'ready' : 'stopped'} state; ${backendOutput.join('')}`,
  );
}

async function startBackend(scenario: string): Promise<void> {
  backendOutput.length = 0;
  backend = spawn('python', ['-m', LAUNCHER_MODULE, '--scenario', scenario], {
    cwd: BACKEND_CWD,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout?.on('data', (chunk: Buffer) => backendOutput.push(chunk.toString('utf8')));
  backend.stderr?.on('data', (chunk: Buffer) => backendOutput.push(chunk.toString('utf8')));
  await waitForBackend(true);
}

async function stopBackend(): Promise<void> {
  if (backend === null) {
    return;
  }
  const process = backend;
  backend = null;
  process.kill();
  await waitForBackend(false);
}

test.afterEach(async () => {
  await stopBackend();
});

async function capture(page: Page, file: string): Promise<void> {
  const path = resolve(OUT, file);
  await page.screenshot({ path, fullPage: false, animations: 'disabled', caret: 'hide' });
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1600);
  expect(bytes.readUInt32BE(20)).toBe(1000);
}

async function openIdle(page: Page): Promise<void> {
  await page.goto('/?fixture=small&theme=light');
  await page.waitForSelector('[data-layout-ready="true"]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function submit(page: Page): Promise<void> {
  await page.fill('[data-testid="prompt-input"]', 'Design a URL shortener with analytics.');
  await page.click('[data-testid="generate-button"]');
}

async function waitForLive(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="canvas"][data-fixture="live"]', { timeout: 60_000 });
  await page.waitForSelector('[data-layout-ready="true"]', { timeout: 60_000 });
}

test.describe('step 6 screenshots', () => {
  test('prompt-idle.png', async ({ page }) => {
    await openIdle(page);
    await expect(page.locator('[data-testid="prompt-input"]')).toBeEnabled();
    await expect(page.locator('[data-testid="generate-button"]')).toBeDisabled();
    await expect(page.locator('[data-testid="lock-indicator"]')).toHaveCount(0);
    await capture(page, 'prompt-idle.png');
  });

  test('run-running.png', async ({ page }) => {
    await startBackend('running');
    await openIdle(page);
    await submit(page);
    await page.waitForSelector('[data-testid="run-status"][data-state="running"]', {
      timeout: 60_000,
    });
    await expect(page.locator('[data-testid="lock-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="prompt-input"]')).toBeDisabled();
    await capture(page, 'run-running.png');
  });

  test('run-success-issues.png', async ({ page }) => {
    await startBackend('issues');
    await openIdle(page);
    await submit(page);
    await waitForLive(page);
    await expect(page.locator('[data-testid="lock-indicator"]')).toHaveCount(0);
    expect(await page.locator('[data-testid="issue-row"]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="blocking-flags-panel"]')).toHaveCount(0);
    await capture(page, 'run-success-issues.png');
  });

  test('run-blocking-flag.png', async ({ page }) => {
    await startBackend('blocking');
    await openIdle(page);
    await submit(page);
    await waitForLive(page);
    const panel = page.locator('[data-testid="blocking-flags-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Unresolved blocking flag');
    await capture(page, 'run-blocking-flag.png');
  });

  test('run-error-429.png', async ({ page }) => {
    await startBackend('rate_limited');
    await openIdle(page);
    await submit(page);
    const error = page.locator('[data-testid="run-error"][data-code="rate_limited"]');
    await error.waitFor({ timeout: 60_000 });
    await expect(error).toContainText(RATE_LIMITED_MESSAGE);
    await expect(page.locator('[data-testid="lock-indicator"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="canvas"][data-fixture="small"]')).toHaveCount(1);
    await capture(page, 'run-error-429.png');
  });
});
