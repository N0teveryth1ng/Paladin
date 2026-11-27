import type { ThemeName } from '../app/modes';
import type { Entry, FixtureName } from '../app/modes';
import { useRef, useState } from 'react';

type ToolIconName = 'new' | 'box' | 'fit' | 'export' | 'copy' | 'check' | 'theme' | 'moon';

function ToolIcon({ name }: { name: ToolIconName }) {
  const paths: Record<ToolIconName, string[]> = {
    new: ['M6 3.75h8l4 4v12.5H6z', 'M14 3.75v4h4', 'M12 10v6', 'M9 13h6'],
    box: ['M4 4.5h16v15H4z', 'M12 8v8', 'M8 12h8'],
    fit: ['M8 3H3v5', 'M3 3l6 6', 'M16 21h5v-5', 'M21 21l-6-6', 'M16 3h5v5', 'M21 3l-6 6', 'M8 21H3v-5', 'M3 21l6-6'],
    export: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 20h16'],
    copy: ['M8 8h12v13H8z', 'M16 8V4H4v13h4'],
    check: ['m5 12 4 4L19 6'],
    theme: ['M12 3v2', 'M12 19v2', 'm5.64 5.64 1.41 1.41', 'm16.95 16.95 1.41 1.41', 'M3 12h2', 'M19 12h2', 'm5.64 18.36 1.41-1.41', 'm16.95 7.05 1.41-1.41', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
    moon: ['M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z'],
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export function Toolbar({
  theme,
  locked,
  onAddComponent,
  onNew,
  onTheme,
  onFit,
  onDownload,
  onDownloadPng,
  onCopy,
  collapsed = false,
  onToggleSidebar = () => {},
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
  onDownloadPng?: () => void;
  onCopy?: () => void;
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportButton = useRef<HTMLButtonElement>(null);
  const copyDiagram = async (): Promise<void> => {
    await onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-label="Paladin" title="Paladin">P</span>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={onToggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          aria-controls="architecture-chat"
          data-testid="sidebar-toggle"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="toolbar-actions" aria-label="Canvas tools">
        {onNew ? <button type="button" onClick={onNew} disabled={locked} data-testid="new-design" title="New design" aria-label="New design"><span className="tool-icon"><ToolIcon name="new" /></span><span className="tool-label">New</span></button> : null}
        {onAddComponent ? <button type="button" onClick={onAddComponent} disabled={locked} data-testid="add-component" title="Add box" aria-label="Add box">
          <span className="tool-icon"><ToolIcon name="box" /></span><span className="tool-label">Add box</span>
        </button> : null}
        <button type="button" onClick={onFit} disabled={locked} data-testid="fit-button" title="Fit canvas" aria-label="Fit canvas">
          <span className="tool-icon"><ToolIcon name="fit" /></span><span className="tool-label">Fit</span>
        </button>
        {onDownload ? (
          <div className="toolbar-export">
            <button
              ref={exportButton}
              type="button"
              onClick={() => setExportOpen((open) => !open)}
              disabled={locked}
              data-testid="export-menu-button"
              aria-expanded={exportOpen}
              title="Export diagram"
              aria-label="Export diagram"
            >
              <span className="tool-icon"><ToolIcon name="export" /></span><span className="tool-label">Export</span>
            </button>
            {exportOpen ? (
              <div
                className="toolbar-export-menu"
                role="group"
                aria-label="Export diagram"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setExportOpen(false);
                    exportButton.current?.focus();
                  }
                }}
              >
                <button type="button" onClick={() => { onDownload(); setExportOpen(false); }} data-testid="download-diagram">
                  SVG <small>Scalable vector</small>
                </button>
                {onDownloadPng ? (
                  <button type="button" onClick={() => { onDownloadPng(); setExportOpen(false); }} data-testid="download-png">
                    PNG <small>High resolution</small>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {onCopy ? <button type="button" onClick={() => void copyDiagram()} disabled={locked} data-testid="copy-diagram" title="Copy as Mermaid" aria-label="Copy as Mermaid"><span className="tool-icon"><ToolIcon name={copied ? 'check' : 'copy'} /></span><span className="tool-label">{copied ? 'Copied' : 'Copy'}</span></button> : null}
        <button type="button" onClick={onTheme} data-testid="theme-button" aria-label="Toggle theme" title="Toggle theme">
          <span className="tool-icon"><ToolIcon name={theme === 'light' ? 'moon' : 'theme'} /></span><span className="tool-label">Theme</span>
        </button>
        {locked ? (
          <span className="run-indicator" data-testid="lock-indicator">Drawing…</span>
        ) : null}
      </nav>
    </header>
  );
}
