import { COMPONENT_TYPES, TYPE_TOKENS, accentFor, typeLabel } from './theme';

export function Legend({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="legend space-y-4 text-[11px] text-zinc-400" data-testid="legend">
      <div className="legend-lines space-y-2">
        <div className="legend-line flex items-center gap-2">
          <svg width="56" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="46" y2="6" className="legend-sync [&]:stroke-zinc-300 [&]:stroke-2" />
            <polygon points="54,6 46,2 46,10" className="legend-arrow-filled fill-zinc-300" />
          </svg>
          <span>sync · solid, filled arrow</span>
        </div>
        <div className="legend-line flex items-center gap-2">
          <svg width="56" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="46" y2="6" className="legend-async [&]:stroke-zinc-300 [&]:stroke-2 [stroke-dasharray:6_4]" />
            <path d="M 46 2 L 54 6 L 46 10" className="legend-arrow-open fill-none [&]:stroke-zinc-300 [&]:stroke-2" />
          </svg>
          <span>async · dashed, open arrow</span>
        </div>
        <div className="legend-line flex items-center gap-2">
          <span className="legend-assumed-box h-3 w-4 rounded border border-dashed border-zinc-500" aria-hidden="true" />
          <span>assumed · dashed border and pill</span>
        </div>
        <div className="legend-line flex flex-wrap items-center gap-2">
          <span className="severity-dot severity-invalid h-2 w-2 rounded-full bg-red-400" aria-hidden="true" />
          <span>invalid issue</span>
          <span className="severity-dot severity-judgment ml-2 h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          <span>judgment issue</span>
        </div>
      </div>

      <ul className="legend-types grid grid-cols-2 gap-x-4 gap-y-2">
        {COMPONENT_TYPES.map((type) => (
          <li key={type} className="flex items-center gap-2" data-testid="legend-type" data-type={type}>
            <span
              className="legend-swatch grid h-4 w-4 place-items-center rounded text-[8px] font-bold text-zinc-950"
              style={{ background: accentFor(type, theme) }}
              aria-hidden="true"
            >
              {TYPE_TOKENS[type].glyph}
            </span>
            <span className="capitalize">{typeLabel(type)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
