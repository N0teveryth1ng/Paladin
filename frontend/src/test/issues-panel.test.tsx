import { createElement } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IssuesPanel } from '../render/IssuesPanel';
import type { IssuesArtifact } from '../types/issues';

import broken from '../fixtures/issues/broken_architecture.issues.json';
import full from '../fixtures/issues/full_coverage_architecture.issues.json';
import small from '../fixtures/issues/small_architecture.issues.json';

const BROKEN = broken as unknown as IssuesArtifact;
const CLEAN = [small as unknown as IssuesArtifact, full as unknown as IssuesArtifact];

afterEach(cleanup);

describe('IssuesPanel', () => {
  it('renders the broken artifact with both severity badges', () => {
    render(createElement(IssuesPanel, { artifact: BROKEN }));

    const panel = screen.getByTestId('issues-panel');
    expect(panel.querySelectorAll('[data-testid="issue-row"]')).toHaveLength(
      BROKEN.issues.length,
    );
    expect(panel.querySelectorAll('.severity-badge.severity-invalid').length).toBeGreaterThan(0);
    expect(panel.querySelectorAll('.severity-badge.severity-judgment').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('issues-empty')).toBeNull();

    const text = panel.textContent ?? '';
    expect(text).toContain(BROKEN.fixture);
    expect(text).toContain(BROKEN.rules_version);
    expect(text).toContain(String(BROKEN.issues.length));
  });

  it('has no control that can mutate the draft', () => {
    const snapshot = JSON.stringify(BROKEN);
    const { container } = render(createElement(IssuesPanel, { artifact: BROKEN }));

    expect(container.querySelectorAll('button, input, select, textarea, a[href]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="button"], [role="switch"], [role="checkbox"]')).toHaveLength(
      0,
    );

    for (const row of container.querySelectorAll('[data-testid="issue-row"]')) {
      fireEvent.click(row);
    }
    expect(JSON.stringify(BROKEN)).toBe(snapshot);
  });

  it('shows every artifact message verbatim', () => {
    const { container } = render(createElement(IssuesPanel, { artifact: BROKEN }));
    const rows = [...container.querySelectorAll('[data-testid="issue-row"]')];

    BROKEN.issues.forEach((issue, index) => {
      const row = rows[index];
      expect(row.getAttribute('data-severity')).toBe(issue.severity);
      expect(row.getAttribute('data-kind')).toBe(issue.kind);
      expect(row.querySelector('.issue-kind')?.textContent).toBe(issue.kind);
      expect(row.querySelector('.issue-element')?.textContent).toBe(issue.element_id ?? '—');
      expect(row.querySelector('.issue-message')?.textContent).toBe(issue.message);
    });
  });

  it('shows the explicit no-issues state for both clean artifacts', () => {
    for (const artifact of CLEAN) {
      const { unmount } = render(createElement(IssuesPanel, { artifact }));
      expect(screen.getByTestId('issues-empty').textContent).toContain('No issues');
      expect(artifact.issues).toHaveLength(0);
      unmount();
    }
  });
});
