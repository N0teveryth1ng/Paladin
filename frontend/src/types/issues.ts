/**
 * Display-only view of a validator issue artifact.
 *
 * Issue is not part of the architecture schema, so this small type is the one
 * hand-written type in src/. A test pins it to the committed artifacts. The
 * frontend never imports the Python validators.
 */

export type DisplayIssueSeverity = 'invalid' | 'judgment';

export interface DisplayIssue {
  kind: string;
  severity: DisplayIssueSeverity;
  element_id: string | null;
  message: string;
}

export interface IssuesArtifact {
  fixture: string;
  rules_version: string;
  issues: DisplayIssue[];
}

export function severityRank(severity: DisplayIssueSeverity): number {
  return severity === 'invalid' ? 2 : 1;
}

export function worstSeverity(issues: DisplayIssue[]): DisplayIssueSeverity | null {
  let worst: DisplayIssueSeverity | null = null;
  for (const issue of issues) {
    if (worst === null || severityRank(issue.severity) > severityRank(worst)) {
      worst = issue.severity;
    }
  }
  return worst;
}

export function issuesFor(issues: DisplayIssue[], elementId: string): DisplayIssue[] {
  return issues.filter((issue) => issue.element_id === elementId);
}
