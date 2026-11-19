import type { ArchitectureDraft } from '../types/architecture.generated';
import type { IssuesArtifact } from '../types/issues';

import smallDraft from '../fixtures/small_architecture.json';
import fullDraft from '../fixtures/full_coverage_architecture.json';
import largeDraft from '../fixtures/large_architecture.json';
import brokenDraft from '../fixtures/broken_architecture.json';
import smallIssues from '../fixtures/issues/small_architecture.issues.json';
import fullIssues from '../fixtures/issues/full_coverage_architecture.issues.json';
import largeIssues from '../fixtures/issues/large_architecture.issues.json';
import brokenIssues from '../fixtures/issues/broken_architecture.issues.json';

export type FixtureName = 'small' | 'full' | 'large' | 'broken';
export type ThemeName = 'light' | 'dark';

export interface FixtureEntry {
  name: FixtureName;
  label: string;
  file: string;
  draft: ArchitectureDraft;
  issues: IssuesArtifact;
}

export const FIXTURES: Record<FixtureName, FixtureEntry> = {
  small: {
    name: 'small',
    label: 'Small · URL shortener',
    file: 'small_architecture.json',
    draft: smallDraft as unknown as ArchitectureDraft,
    issues: smallIssues as unknown as IssuesArtifact,
  },
  full: {
    name: 'full',
    label: 'Full coverage · video platform',
    file: 'full_coverage_architecture.json',
    draft: fullDraft as unknown as ArchitectureDraft,
    issues: fullIssues as unknown as IssuesArtifact,
  },
  large: {
    name: 'large',
    label: 'Large · 120 components',
    file: 'large_architecture.json',
    draft: largeDraft as unknown as ArchitectureDraft,
    issues: largeIssues as unknown as IssuesArtifact,
  },
  broken: {
    name: 'broken',
    label: 'Broken · malformed soft rules',
    file: 'broken_architecture.json',
    draft: brokenDraft as unknown as ArchitectureDraft,
    issues: brokenIssues as unknown as IssuesArtifact,
  },
};

export const FIXTURE_NAMES: FixtureName[] = ['small', 'full', 'large', 'broken'];

export interface AppMode {
  fixture: FixtureName;
  theme: ThemeName;
  locked: boolean;
  focus: string | null;
  zoom: number | null;
}

/**
 * Query parameters make every screenshot deterministic. Unknown values fall
 * back to the defaults; the app never throws for a bad URL.
 */
export function parseMode(search: string, prefersDark: boolean): AppMode {
  const params = new URLSearchParams(search);

  const fixtureParam = params.get('fixture');
  const fixture = FIXTURE_NAMES.includes(fixtureParam as FixtureName)
    ? (fixtureParam as FixtureName)
    : 'small';

  const themeParam = params.get('theme');
  const theme: ThemeName =
    themeParam === 'dark' || themeParam === 'light'
      ? themeParam
      : prefersDark
        ? 'dark'
        : 'light';

  const focus = params.get('focus');
  const zoomParam = Number(params.get('zoom'));
  const zoom =
    params.has('zoom') && Number.isFinite(zoomParam) && zoomParam > 0 && zoomParam <= 4
      ? zoomParam
      : null;

  return {
    fixture,
    theme,
    locked: params.get('locked') === '1',
    focus: focus !== null && focus.length > 0 ? focus : null,
    zoom,
  };
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
