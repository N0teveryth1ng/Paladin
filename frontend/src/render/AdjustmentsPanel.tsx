import type { LayoutAdjustment } from '../layout/layoutTypes';

export function AdjustmentsPanel({ adjustments }: { adjustments: LayoutAdjustment[] }) {
  return (
    <section className="panel-section" data-testid="adjustments-panel">
      <h3>
        Layout adjustments <span className="count">{adjustments.length}</span>
      </h3>
      {adjustments.length === 0 ? (
        <p className="empty">No layout adjustments</p>
      ) : (
        <ul className="adjustment-list">
          {adjustments.map((adjustment, index) => (
            <li
              key={`${adjustment.kind}-${index}`}
              data-testid="adjustment-row"
              data-kind={adjustment.kind}
            >
              <span className="adjustment-kind">{adjustment.kind}</span>
              <span className="adjustment-message">{adjustment.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
