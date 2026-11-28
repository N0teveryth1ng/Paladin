import { AlertTriangle } from 'lucide-react';

import type { Flag } from '../types/architecture.generated';

/**
 * Blocking flags are part of a delivered draft. This panel is always present
 * while such a flag exists: no dismiss, no collapse, no tab, no scroll region.
 * Warning flags stay in the side panel and are never called unresolved here.
 */
export function BlockingFlagsPanel({ flags }: { flags: Flag[] }) {
  const blocking = flags.filter((flag) => flag.severity === 'blocking');
  if (blocking.length === 0) {
    return null;
  }

  return (
    <section
      className="blocking-flags space-y-2"
      data-testid="blocking-flags-panel"
      role="region"
      aria-label="Unresolved blocking flags"
    >
      {blocking.map((flag) => (
        <article
          className="blocking-flag rounded-xl border border-red-500/25 bg-red-500/[0.07] p-3.5 shadow-lg backdrop-blur-xl"
          data-testid="blocking-flag"
          data-flag-id={flag.id}
          key={flag.id}
        >
          <h2 className="m-0 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-red-200">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Unresolved blocking flag
          </h2>
          <p className="blocking-description mt-2 m-0 text-[12px] leading-relaxed text-red-100/80">{flag.description}</p>
          <p className="blocking-refs mono mt-2 m-0 font-mono text-[10px] text-red-300/60">
            Requirements: {(flag.requirement_refs ?? []).join(', ') || '—'}
          </p>
        </article>
      ))}
    </section>
  );
}
