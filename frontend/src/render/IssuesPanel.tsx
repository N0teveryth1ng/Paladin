import type { DisplayIssue, IssuesArtifact } from '../types/issues';

export function IssuesPanel({ artifact }: { artifact: IssuesArtifact }) {
  const invalid = artifact.issues.filter((issue) => issue.severity === 'invalid').length;
  const judgment = artifact.issues.filter((issue) => issue.severity === 'judgment').length;

  return (
    <section className="panel-section rounded-xl border border-white/[0.07] bg-white/[0.02] p-4" data-testid="issues-panel">
      <h3 className="m-0 flex items-center gap-2 text-[12px] font-semibold text-zinc-100">
        Validator issues <span className="count rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{artifact.issues.length}</span>
      </h3>
      <p className="panel-note mt-2 text-[10px] leading-relaxed text-zinc-500">
        {artifact.fixture} · rules {artifact.rules_version} · {invalid} invalid · {judgment} judgment
      </p>
      <p className="panel-note mt-1 text-[10px] leading-relaxed text-zinc-500">
        Read-only output of the committed validator artifact. It is never fed back into generation.
      </p>

      {artifact.issues.length === 0 ? (
        <p className="empty mt-3 text-[11px] text-zinc-500" data-testid="issues-empty">
          No issues
        </p>
      ) : (
        <ul className="issue-list mt-3 space-y-2">
          {artifact.issues.map((issue: DisplayIssue, index: number) => (
            <li
              key={`${issue.kind}-${issue.element_id ?? 'none'}-${index}`}
              className="issue-row rounded-lg border border-white/[0.06] bg-[var(--paladin-frost-strong)] p-2.5"
              data-testid="issue-row"
              data-severity={issue.severity}
              data-kind={issue.kind}
            >
              <div className="issue-head flex flex-wrap items-center gap-2 text-[10px]">
                <span className={`severity-badge severity-${issue.severity} rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide ${issue.severity === 'invalid' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {issue.severity}
                </span>
                <span className="issue-kind text-zinc-400">{issue.kind}</span>
                <span className="issue-element font-mono text-zinc-600">{issue.element_id ?? '—'}</span>
              </div>
              <p className="issue-message mt-1.5 m-0 text-[11px] leading-relaxed text-zinc-300">{issue.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
