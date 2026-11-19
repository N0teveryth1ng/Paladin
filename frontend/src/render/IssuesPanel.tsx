import type { DisplayIssue, IssuesArtifact } from '../types/issues';

export function IssuesPanel({ artifact }: { artifact: IssuesArtifact }) {
  const invalid = artifact.issues.filter((issue) => issue.severity === 'invalid').length;
  const judgment = artifact.issues.filter((issue) => issue.severity === 'judgment').length;

  return (
    <section className="panel-section" data-testid="issues-panel">
      <h3>
        Validator issues <span className="count">{artifact.issues.length}</span>
      </h3>
      <p className="panel-note">
        {artifact.fixture} · rules {artifact.rules_version} · {invalid} invalid · {judgment} judgment
      </p>
      <p className="panel-note">
        Read-only output of the committed validator artifact. It is never fed back into
        generation.
      </p>

      {artifact.issues.length === 0 ? (
        <p className="empty" data-testid="issues-empty">
          No issues
        </p>
      ) : (
        <ul className="issue-list">
          {artifact.issues.map((issue: DisplayIssue, index: number) => (
            <li
              key={`${issue.kind}-${issue.element_id ?? 'none'}-${index}`}
              className="issue-row"
              data-testid="issue-row"
              data-severity={issue.severity}
              data-kind={issue.kind}
            >
              <div className="issue-head">
                <span className={`severity-badge severity-${issue.severity}`}>
                  {issue.severity}
                </span>
                <span className="issue-kind">{issue.kind}</span>
                <span className="issue-element">{issue.element_id ?? '—'}</span>
              </div>
              <p className="issue-message">{issue.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
