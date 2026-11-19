import { COMPONENT_TYPES, TYPE_TOKENS, accentFor, typeLabel } from './theme';

export function Legend({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="legend" data-testid="legend">
      <div className="legend-lines">
        <div className="legend-line">
          <svg width="56" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="46" y2="6" className="legend-sync" />
            <polygon points="54,6 46,2 46,10" className="legend-arrow-filled" />
          </svg>
          <span>sync · solid, filled arrow</span>
        </div>
        <div className="legend-line">
          <svg width="56" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="46" y2="6" className="legend-async" />
            <path d="M 46 2 L 54 6 L 46 10" className="legend-arrow-open" />
          </svg>
          <span>async · dashed, open arrow</span>
        </div>
        <div className="legend-line">
          <span className="legend-assumed-box" aria-hidden="true" />
          <span>assumed · dashed border and pill</span>
        </div>
        <div className="legend-line">
          <span className="severity-dot severity-invalid" aria-hidden="true" />
          <span>invalid issue</span>
          <span className="severity-dot severity-judgment" aria-hidden="true" />
          <span>judgment issue</span>
        </div>
      </div>

      <ul className="legend-types">
        {COMPONENT_TYPES.map((type) => (
          <li key={type} data-testid="legend-type" data-type={type}>
            <span
              className="legend-swatch"
              style={{ background: accentFor(type, theme) }}
              aria-hidden="true"
            >
              {TYPE_TOKENS[type].glyph}
            </span>
            <span>{typeLabel(type)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
