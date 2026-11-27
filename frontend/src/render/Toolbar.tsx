import type { ThemeName } from '../app/modes';
import type { Entry, FixtureName } from '../app/modes';
import { useState } from 'react';

export function Toolbar({
  theme,
  locked,
  onAddComponent,
  onNew,
  onTheme,
  onFit,
  onDownload,
  onCopy,
}: {
  title?: string;
  entry?: Entry;
  theme: ThemeName;
  locked: boolean;
  onAddComponent?: () => void;
  onNew?: () => void;
  onFixture?: (name: FixtureName) => void;
  onTheme: () => void;
  onFit: () => void;
  onDownload?: () => void;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyDiagram = async (): Promise<void> => {
    await onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="brand">
        <span className="brand-name">Paladin</span>
      </div>

      <div className="toolbar-actions">
        {onNew ? <button type="button" onClick={onNew} disabled={locked} data-testid="new-design">New</button> : null}
        {onAddComponent ? <button type="button" onClick={onAddComponent} disabled={locked} data-testid="add-component">
          <span aria-hidden="true">＋</span> Add box
        </button> : null}
        <button type="button" onClick={onFit} disabled={locked} data-testid="fit-button">
          Fit canvas
        </button>
        {onDownload ? <button type="button" onClick={onDownload} disabled={locked} data-testid="download-diagram" title="Download as SVG">Download</button> : null}
        {onCopy ? <button type="button" onClick={() => void copyDiagram()} disabled={locked} data-testid="copy-diagram" title="Copy as Mermaid">{copied ? 'Copied' : 'Copy'}</button> : null}
        <button type="button" onClick={onTheme} data-testid="theme-button" aria-label="Toggle theme">
          {theme === 'light' ? '◐' : '☼'}
        </button>
        {locked ? (
          <span className="run-indicator" data-testid="lock-indicator">Drawing…</span>
        ) : null}
      </div>
    </header>
  );
}
