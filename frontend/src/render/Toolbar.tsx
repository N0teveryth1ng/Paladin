import type { FixtureEntry, FixtureName, ThemeName } from '../app/modes';
import { FIXTURES, FIXTURE_NAMES } from '../app/modes';

export function Toolbar({
  entry,
  theme,
  locked,
  onFixture,
  onTheme,
  onFit,
}: {
  entry: FixtureEntry;
  theme: ThemeName;
  locked: boolean;
  onFixture: (name: FixtureName) => void;
  onTheme: () => void;
  onFit: () => void;
}) {
  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="brand">
        <span className="brand-name">Paladin</span>
        <span className="brand-tag">deterministic render</span>
      </div>

      <label className="fixture-picker">
        <span>Fixture</span>
        <select
          value={entry.name}
          onChange={(event) => onFixture(event.target.value as FixtureName)}
          data-testid="fixture-select"
          disabled={locked}
        >
          {FIXTURE_NAMES.map((name) => (
            <option key={name} value={name}>
              {FIXTURES[name].label}
            </option>
          ))}
          {entry.name === 'live' ? (
            <option value="live" disabled>
              Live run
            </option>
          ) : null}
        </select>
      </label>

      <div className="toolbar-actions">
        <button type="button" onClick={onFit} disabled={locked} data-testid="fit-button">
          Fit
        </button>
        <button type="button" onClick={onTheme} data-testid="theme-button">
          {theme === 'light' ? 'Dark theme' : 'Light theme'}
        </button>
        {locked ? (
          <span className="lock-badge" data-testid="lock-indicator">
            Locked while the agent runs
          </span>
        ) : (
          <span className="mode-badge">view-only · pan and zoom</span>
        )}
      </div>
    </header>
  );
}
