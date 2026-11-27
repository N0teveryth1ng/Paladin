import type { ThemeName } from '../app/modes';
import type { Entry, FixtureName } from '../app/modes';
import { useRef, useState } from 'react';

type ToolIconName = 'new' | 'open' | 'undo' | 'redo' | 'box' | 'fit' | 'export' | 'copy' | 'check' | 'theme' | 'moon' | 'image' | 'history' | 'template' | 'import' | 'review';

function ToolIcon({ name }: { name: ToolIconName }) {
  const paths: Record<ToolIconName, string[]> = {
    new: ['M6 3.75h8l4 4v12.5H6z', 'M14 3.75v4h4', 'M12 10v6', 'M9 13h6'],
    open: ['M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.75a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 1 1 0 12h-1'],
    redo: ['m15 14 5-5-5-5', 'M20 9H10a6 6 0 1 0 0 12h1'],
    box: ['M4 4.5h16v15H4z', 'M12 8v8', 'M8 12h8'],
    fit: ['M8 3H3v5', 'M3 3l6 6', 'M16 21h5v-5', 'M21 21l-6-6', 'M16 3h5v5', 'M21 3l-6 6', 'M8 21H3v-5', 'M3 21l6-6'],
    export: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 20h16'],
    copy: ['M8 8h12v13H8z', 'M16 8V4H4v13h4'],
    check: ['m5 12 4 4L19 6'],
    theme: ['M12 3v2', 'M12 19v2', 'm5.64 5.64 1.41 1.41', 'm16.95 16.95 1.41 1.41', 'M3 12h2', 'M19 12h2', 'm5.64 18.36 1.41-1.41', 'm16.95 7.05 1.41-1.41', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
    moon: ['M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z'],
    image: ['M4 5h16v14H4z', 'm8 13 2.5-3 2 2.5L15 9l3 4', 'M9 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'],
    history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v6l4 2'],
    template: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
    import: ['M12 21V9', 'm7 14 5-5 5 5', 'M4 4h16'],
    review: ['M9 12l2 2 4-4', 'M12 21a9 9 0 1 1 9-9', 'M21 21l-3.5-3.5'],
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
  onOpen,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onTheme,
  onFit,
  onDownload,
  onDownloadPng,
  onDownloadBundle,
  onSave,
  onCopy,
  onCopyImage,
  onCheckpoint,
  onHistory,
  onTemplates,
  onImportSource,
  onReview,
  collapsed = false,
  onToggleSidebar = () => {},
}: {
  title?: string;
  entry?: Entry;
  theme: ThemeName;
  locked: boolean;
  onAddComponent?: () => void;
  onNew?: () => void;
  onOpen?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onFixture?: (name: FixtureName) => void;
  onTheme: () => void;
  onFit: () => void;
  onDownload?: () => void;
  onDownloadPng?: () => void;
  onDownloadBundle?: () => void;
  onSave?: () => void;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onCheckpoint?: () => void;
  onHistory?: () => void;
  onTemplates?: () => void;
  onImportSource?: () => void;
  onReview?: () => void;
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportButton = useRef<HTMLButtonElement>(null);
  const copyDiagram = async (): Promise<void> => {
    await onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const copyImage = async (): Promise<void> => {
    await onCopyImage?.();
    setCopiedImage(true);
    window.setTimeout(() => setCopiedImage(false), 1600);
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
        {onOpen ? <button type="button" onClick={onOpen} disabled={locked} data-testid="open-design" title="Open saved design" aria-label="Open saved design"><span className="tool-icon"><ToolIcon name="open" /></span><span className="tool-label">Open</span></button> : null}
        {onUndo ? <button type="button" onClick={onUndo} disabled={locked || !canUndo} data-testid="undo-button" title="Undo (Ctrl+Z)" aria-label="Undo"><span className="tool-icon"><ToolIcon name="undo" /></span><span className="tool-label">Undo</span></button> : null}
        {onRedo ? <button type="button" onClick={onRedo} disabled={locked || !canRedo} data-testid="redo-button" title="Redo (Ctrl+Y)" aria-label="Redo"><span className="tool-icon"><ToolIcon name="redo" /></span><span className="tool-label">Redo</span></button> : null}
        {onAddComponent ? <button type="button" onClick={onAddComponent} disabled={locked} data-testid="add-component" title="Add box" aria-label="Add box">
          <span className="tool-icon"><ToolIcon name="box" /></span><span className="tool-label">Add box</span>
        </button> : null}
        {onTemplates ? <button type="button" onClick={onTemplates} disabled={locked} data-testid="templates-button" title="Templates and remix" aria-label="Templates"><span className="tool-icon"><ToolIcon name="template" /></span><span className="tool-label">Templates</span></button> : null}
        {onImportSource ? <button type="button" onClick={onImportSource} disabled={locked} data-testid="import-source-button" title="Generate from source" aria-label="Import source"><span className="tool-icon"><ToolIcon name="import" /></span><span className="tool-label">Import</span></button> : null}
        {onReview ? <button type="button" onClick={onReview} disabled={locked} data-testid="review-button" title="Critique / review architecture" aria-label="Review architecture"><span className="tool-icon"><ToolIcon name="review" /></span><span className="tool-label">Review</span></button> : null}
        {onCheckpoint ? <button type="button" onClick={onCheckpoint} disabled={locked} data-testid="checkpoint-button" title="Save checkpoint" aria-label="Save checkpoint"><span className="tool-icon"><ToolIcon name="check" /></span><span className="tool-label">Checkpoint</span></button> : null}
        {onHistory ? <button type="button" onClick={onHistory} data-testid="history-button" title="Version history" aria-label="Version history"><span className="tool-icon"><ToolIcon name="history" /></span><span className="tool-label">History</span></button> : null}
        <button type="button" onClick={onFit} disabled={locked} data-testid="fit-button" title="Fit canvas" aria-label="Fit canvas">
          <span className="tool-icon"><ToolIcon name="fit" /></span><span className="tool-label">Fit</span>
        </button>
        {onDownload || onSave || onDownloadBundle || onCopyImage ? (
          <div className="toolbar-export">
            <button
              ref={exportButton}
              type="button"
              onClick={() => setExportOpen((open) => !open)}
              disabled={locked}
              data-testid="export-menu-button"
              aria-expanded={exportOpen}
              title="Export / Save"
              aria-label="Export or save"
            >
              <span className="tool-icon"><ToolIcon name="export" /></span><span className="tool-label">Export</span>
            </button>
            {exportOpen ? (
              <div
                className="toolbar-export-menu"
                role="group"
                aria-label="Export or save"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setExportOpen(false);
                    exportButton.current?.focus();
                  }
                }}
              >
                {onDownload ? (
                  <button type="button" onClick={() => { onDownload(); setExportOpen(false); }} data-testid="download-diagram">
                    SVG <small>Scalable vector</small>
                  </button>
                ) : null}
                {onDownloadPng ? (
                  <button type="button" onClick={() => { onDownloadPng(); setExportOpen(false); }} data-testid="download-png">
                    PNG <small>High resolution</small>
                  </button>
                ) : null}
                {onDownloadBundle ? (
                  <button type="button" onClick={() => { onDownloadBundle(); setExportOpen(false); }} data-testid="download-bundle">
                    JSON+PNG bundle <small>Design + image</small>
                  </button>
                ) : null}
                {onSave ? (
                  <button type="button" onClick={() => { onSave(); setExportOpen(false); }} data-testid="save-file">
                    Save <small>Local .paladin.json</small>
                  </button>
                ) : null}
                <div className="toolbar-export-note">Shareable read-only link: coming when hosted sharing is available.</div>
              </div>
            ) : null}
          </div>
        ) : null}
        {onCopy ? <button type="button" onClick={() => void copyDiagram()} disabled={locked} data-testid="copy-diagram" title="Copy as Mermaid" aria-label="Copy as Mermaid"><span className="tool-icon"><ToolIcon name={copied ? 'check' : 'copy'} /></span><span className="tool-label">{copied ? 'Copied' : 'Copy'}</span></button> : null}
        {onCopyImage ? <button type="button" onClick={() => void copyImage()} disabled={locked} data-testid="copy-image" title="Copy as image" aria-label="Copy as image"><span className="tool-icon"><ToolIcon name={copiedImage ? 'check' : 'image'} /></span><span className="tool-label">{copiedImage ? 'Copied' : 'Copy image'}</span></button> : null}
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
