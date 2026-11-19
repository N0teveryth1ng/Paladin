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
      className="blocking-flags"
      data-testid="blocking-flags-panel"
      role="region"
      aria-label="Unresolved blocking flags"
    >
      {blocking.map((flag) => (
        <article
          className="blocking-flag"
          data-testid="blocking-flag"
          data-flag-id={flag.id}
          key={flag.id}
        >
          <h2>Unresolved blocking flag</h2>
          <p className="blocking-description">{flag.description}</p>
          <p className="blocking-refs mono">
            Requirements: {(flag.requirement_refs ?? []).join(', ') || '—'}
          </p>
        </article>
      ))}
    </section>
  );
}
