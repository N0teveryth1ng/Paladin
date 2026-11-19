import type { Entry, ThemeName } from '../app/modes';
import type { LayoutResult } from '../layout/layoutTypes';
import { issuesFor } from '../types/issues';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { IssuesPanel } from './IssuesPanel';
import { Legend } from './Legend';
import { typeLabel } from './theme';

export type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'edge'; id: string }
  | null;

export function SidePanel({
  entry,
  result,
  selection,
  onSelect,
  theme,
}: {
  entry: Entry;
  result: LayoutResult;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  theme: ThemeName;
}) {
  const draft = entry.draft;
  const issues = entry.issues.issues;

  return (
    <aside className="side-panel" data-testid="side-panel">
      <div className="side-panel-header">
        <h2>{draft.title}</h2>
        <p className="panel-note">{draft.summary}</p>
      </div>

      <section className="panel-section" data-testid="overview-panel">
        <h3>Overview</h3>
        <dl className="count-grid">
          <div>
            <dt>Components</dt>
            <dd>{draft.components.length}</dd>
          </div>
          <div>
            <dt>Connections</dt>
            <dd>{draft.connections?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Groups</dt>
            <dd>{draft.groups?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Requirements</dt>
            <dd>{draft.requirements.length}</dd>
          </div>
          <div>
            <dt>Assumptions</dt>
            <dd>{draft.assumptions?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Flags</dt>
            <dd>{draft.flags?.length ?? 0}</dd>
          </div>
        </dl>
      </section>

      <SelectedDetails
        entry={entry}
        result={result}
        selection={selection}
        onSelect={onSelect}
      />

      <details className="panel-section" open>
        <summary>
          Requirements <span className="count">{draft.requirements.length}</span>
        </summary>
        <ul className="detail-list">
          {draft.requirements.map((requirement) => (
            <li key={requirement.id}>
              <div className="detail-head">
                <span className="mono">{requirement.id}</span>
                <span className="tag">
                  {requirement.kind} · {requirement.source}
                </span>
              </div>
              <p>{requirement.text}</p>
            </li>
          ))}
        </ul>
      </details>

      <details className="panel-section" open>
        <summary>
          Assumptions <span className="count">{draft.assumptions?.length ?? 0}</span>
        </summary>
        {(draft.assumptions?.length ?? 0) === 0 ? (
          <p className="empty">No assumptions</p>
        ) : (
          <ul className="detail-list">
            {(draft.assumptions ?? []).map((assumption) => (
              <li key={assumption.id}>
                <div className="detail-head">
                  <span className="mono">{assumption.id}</span>
                  <span className="tag">{assumption.scope}</span>
                </div>
                <p>{assumption.text}</p>
                <p className="muted">{assumption.rationale}</p>
                {(assumption.element_refs?.length ?? 0) > 0 ? (
                  <p className="mono muted">refs: {(assumption.element_refs ?? []).join(', ')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="panel-section" open>
        <summary>
          Flags <span className="count">{draft.flags?.length ?? 0}</span>
        </summary>
        {(draft.flags?.length ?? 0) === 0 ? (
          <p className="empty">No flags</p>
        ) : (
          <ul className="detail-list">
            {(draft.flags ?? []).map((flag) => (
              <li key={flag.id} data-testid="flag-row" data-severity={flag.severity}>
                <div className="detail-head">
                  <span className={`severity-badge severity-${flag.severity}`}>{flag.severity}</span>
                  <span className="mono">{flag.kind}</span>
                </div>
                <p>{flag.description}</p>
                <p className="mono muted">refs: {(flag.requirement_refs ?? []).join(', ') || '—'}</p>
              </li>
            ))}
          </ul>
        )}
      </details>

      <AdjustmentsPanel adjustments={result.adjustments} />

      <details className="panel-section" open>
        <summary>Legend</summary>
        <Legend theme={theme} />
      </details>

      <IssuesPanel artifact={entry.issues} />

      <p className="panel-footer">
        Layout {Math.round(result.width)} × {Math.round(result.height)} · {result.nodes.length}{' '}
        nodes · {result.edges.length} edges · {issues.length} issues
      </p>
    </aside>
  );
}

function SelectedDetails({
  entry,
  result,
  selection,
  onSelect,
}: {
  entry: Entry;
  result: LayoutResult;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  if (selection === null) {
    return (
      <section className="panel-section">
        <h3>Selected</h3>
        <p className="empty">Click a component, group or edge to inspect it.</p>
      </section>
    );
  }

  const issues = entry.issues.issues;
  const elementIssues = issuesFor(issues, selection.id);

  if (selection.kind === 'edge') {
    const edge = result.edges.find((candidate) => candidate.id === selection.id);
    if (edge === undefined) {
      return null;
    }
    return (
      <section className="panel-section selected-panel" data-testid="selected-panel">
        <h3>
          Selected edge <button className="link-button" onClick={() => onSelect(null)}>clear</button>
        </h3>
        <dl className="kv">
          <dt>id</dt>
          <dd className="mono">{edge.id}</dd>
          <dt>from → to</dt>
          <dd className="mono">
            {edge.from} → {edge.to}
          </dd>
          <dt>type</dt>
          <dd>{edge.type}</dd>
          <dt>label</dt>
          <dd>{edge.label}</dd>
          <dt>technology</dt>
          <dd>{edge.technology ?? '—'}</dd>
          <dt>assumed</dt>
          <dd>{edge.assumed ? 'yes' : 'no'}</dd>
        </dl>
        <IssueSummary issues={elementIssues} />
      </section>
    );
  }

  const node = result.nodes.find(
    (candidate) => candidate.id === selection.id && candidate.kind === selection.kind,
  );
  if (node === undefined) {
    return null;
  }

  if (node.kind === 'group' && node.group !== undefined) {
    const group = node.group;
    return (
      <section className="panel-section selected-panel" data-testid="selected-panel">
        <h3>
          Selected group <button className="link-button" onClick={() => onSelect(null)}>clear</button>
        </h3>
        <dl className="kv">
          <dt>id</dt>
          <dd className="mono">{group.id}</dd>
          <dt>name</dt>
          <dd>{group.name}</dd>
          <dt>members</dt>
          <dd>{group.members.join(', ')}</dd>
          <dt>parent</dt>
          <dd className="mono">{group.parent_id ?? '—'}</dd>
          <dt>assumed</dt>
          <dd>{group.assumed ? 'yes' : 'no'}</dd>
        </dl>
        <p>{group.description}</p>
        {group.rationale !== null && group.rationale !== undefined ? (
          <p className="muted">{group.rationale}</p>
        ) : null}
        <IssueSummary issues={elementIssues} />
      </section>
    );
  }

  const component = node.component;
  if (component === undefined) {
    return null;
  }

  return (
    <section className="panel-section selected-panel" data-testid="selected-panel">
      <h3>
        Selected component <button className="link-button" onClick={() => onSelect(null)}>clear</button>
      </h3>
      <dl className="kv">
        <dt>id</dt>
        <dd className="mono">{component.id}</dd>
        <dt>type</dt>
        <dd>{typeLabel(component.type)}</dd>
        <dt>technology</dt>
        <dd>{component.technology ?? '—'}</dd>
        <dt>assumed</dt>
        <dd>{component.assumed ? 'yes' : 'no'}</dd>
        <dt>requirements</dt>
        <dd className="mono">{(component.requirement_refs ?? []).join(', ') || '—'}</dd>
      </dl>
      <p>{component.description}</p>
      {component.rationale !== null && component.rationale !== undefined ? (
        <p className="muted">{component.rationale}</p>
      ) : null}
      <IssueSummary issues={elementIssues} />
    </section>
  );
}

function IssueSummary({ issues }: { issues: ReturnType<typeof issuesFor> }) {
  if (issues.length === 0) {
    return <p className="empty">No validator issues name this element.</p>;
  }
  return (
    <ul className="detail-list">
      {issues.map((issue, index) => (
        <li key={`${issue.kind}-${index}`}>
          <span className={`severity-badge severity-${issue.severity}`}>{issue.severity}</span>{' '}
          <span className="mono">{issue.kind}</span>
          <p>{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}
