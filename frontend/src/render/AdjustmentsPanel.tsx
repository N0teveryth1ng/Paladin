import type { LayoutAdjustment } from '../layout/layoutTypes';

export function AdjustmentsPanel({ adjustments }: { adjustments: LayoutAdjustment[] }) {
  return (
    <section className="panel-section rounded-xl border border-white/[0.07] bg-white/[0.02] p-4" data-testid="adjustments-panel">
      <h3 className="m-0 flex items-center gap-2 text-[12px] font-semibold text-zinc-100">
        Layout adjustments <span className="count rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{adjustments.length}</span>
      </h3>
      {adjustments.length === 0 ? (
        <p className="empty mt-3 text-[11px] text-zinc-500">No layout adjustments</p>
      ) : (
        <ul className="adjustment-list mt-3 space-y-1.5">
          {adjustments.map((adjustment, index) => (
            <li
              key={`${adjustment.kind}-${index}`}
              className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11px]"
              data-testid="adjustment-row"
              data-kind={adjustment.kind}
            >
              <span className="adjustment-kind shrink-0 rounded bg-indigo-400/10 px-1.5 py-0.5 font-medium text-indigo-300">{adjustment.kind}</span>
              <span className="adjustment-message text-zinc-400">{adjustment.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
