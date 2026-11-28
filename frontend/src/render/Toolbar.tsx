'use client';

import {
  BookmarkPlus,
  Clipboard,
  Download,
  FileCode2,
  FolderOpen,
  History,
  Image as ImageIcon,
  LayoutTemplate,
  Maximize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  ScanSearch,
  SquarePlus,
  Sun,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import type { ThemeName } from '../app/modes';
import type { Entry, FixtureName } from '../app/modes';

type ToolIconName =
  | 'new' | 'open' | 'undo' | 'redo' | 'fit' | 'export' | 'copy'
  | 'check' | 'theme' | 'moon' | 'image' | 'history' | 'template' | 'import' | 'review';

const ICONS: Record<ToolIconName, LucideIcon> = {
  new: SquarePlus,
  open: FolderOpen,
  undo: Undo2,
  redo: Redo2,
  fit: Maximize2,
  export: Download,
  copy: Clipboard,
  check: BookmarkPlus,
  theme: Sun,
  moon: Moon,
  image: ImageIcon,
  history: History,
  template: LayoutTemplate,
  import: FileCode2,
  review: ScanSearch,
};

function ToolIcon({ name }: { name: ToolIconName }) {
  const Icon = ICONS[name];
  return <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />;
}

export function Toolbar({
  theme,
  locked,
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
  const exportMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    // Capture phase: the canvas stops mousedown propagation, so a bubble
    // listener would never see clicks outside the sidebar.
    const onOutsidePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (exportButton.current?.contains(target) || exportMenu.current?.contains(target)) return;
      setExportOpen(false);
    };
    const onLayoutChange = () => setExportOpen(false);
    document.addEventListener('mousedown', onOutsidePointerDown, true);
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    return () => {
      document.removeEventListener('mousedown', onOutsidePointerDown, true);
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [exportOpen]);

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

  const exportMenuStyle = (() => {
    const rect = exportButton.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return {
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
      left: rect.right + 8,
    };
  })();

  const toolButton = (name: ToolIconName, testId: string, label: string, onClick?: () => void, disabled = false) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={locked || disabled}
      data-testid={testId}
      title={label}
      aria-label={label}
    >
      <ToolIcon name={name} />
    </Button>
  );

  return (
    <>
      <header
        className="fixed left-[calc(var(--paladin-sidebar-width)+2rem)] right-4 top-4 z-30 flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-[var(--paladin-frost)] px-2 shadow-2xl backdrop-blur-2xl"
        data-testid="toolbar"
      >
        <div className="flex shrink-0 items-center gap-2 border-r border-white/10 px-1.5 pr-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-indigo-300/25 bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/15 text-[11px] font-bold text-indigo-100 shadow-[0_0_18px_-6px_rgba(139,92,246,0.9)]">
            P
          </span>
        </div>

        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Canvas tools">
          <div className="flex shrink-0 items-center gap-0.5 first:border-l-0" role="group" aria-label="File">
            {onNew ? toolButton('new', 'new-design', 'New design', onNew) : null}
            {onOpen ? toolButton('open', 'open-design', 'Open saved design', onOpen) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-1.5" role="group" aria-label="Edit">
            {onUndo ? toolButton('undo', 'undo-button', 'Undo', onUndo, !canUndo) : null}
            {onRedo ? toolButton('redo', 'redo-button', 'Redo', onRedo, !canRedo) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-1.5" role="group" aria-label="Design">
            {onTemplates ? toolButton('template', 'templates-button', 'Templates', onTemplates) : null}
            {onImportSource ? toolButton('import', 'import-source-button', 'Import source', onImportSource) : null}
            {onReview ? toolButton('review', 'review-button', 'Review architecture', onReview) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-1.5" role="group" aria-label="History">
            {onCheckpoint ? toolButton('check', 'checkpoint-button', 'Save checkpoint', onCheckpoint) : null}
            {onHistory ? toolButton('history', 'history-button', 'Version history', onHistory) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-1.5" role="group" aria-label="View and export">
            {toolButton('fit', 'fit-button', 'Fit canvas', onFit)}
            {onDownload || onSave || onDownloadBundle || onCopyImage ? (
              <>
                <Button
                  ref={exportButton}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setExportOpen((open) => !open)}
                  disabled={locked}
                  data-testid="export-menu-button"
                  aria-expanded={exportOpen}
                  title="Export / Save"
                  aria-label="Export or save"
                  className={cn(exportOpen && 'bg-white/10 text-white')}
                >
                  <ToolIcon name="export" />
                </Button>
                {exportOpen ? (
                  <div
                    ref={exportMenu}
                    className="fixed z-[120] flex w-56 flex-col gap-0.5 rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-2xl"
                    role="group"
                    aria-label="Export or save"
                    style={exportMenuStyle}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setExportOpen(false);
                        exportButton.current?.focus();
                      }
                    }}
                  >
                    {onDownload ? <ExportItem testId="download-diagram" label="SVG" hint="Scalable vector" onClick={onDownload} onSelect={() => setExportOpen(false)} /> : null}
                    {onDownloadPng ? <ExportItem testId="download-png" label="PNG" hint="High resolution" onClick={onDownloadPng} onSelect={() => setExportOpen(false)} /> : null}
                    {onDownloadBundle ? <ExportItem testId="download-bundle" label="JSON+PNG" hint="Design + image" onClick={onDownloadBundle} onSelect={() => setExportOpen(false)} /> : null}
                    {onSave ? <ExportItem testId="save-file" label="Save" hint="Local .paladin.json" onClick={onSave} onSelect={() => setExportOpen(false)} /> : null}
                    <div className="mt-1 border-t border-white/[0.08] px-2 py-2 text-[10px] leading-snug text-zinc-500">
                      Shareable read-only link: coming when hosted sharing is available.
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {onCopy ? toolButton(copied ? 'check' : 'copy', 'copy-diagram', copied ? 'Copied' : 'Copy as Mermaid', () => void copyDiagram()) : null}
            {onCopyImage ? toolButton(copiedImage ? 'check' : 'image', 'copy-image', copiedImage ? 'Copied' : 'Copy as image', () => void copyImage()) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-1.5" role="group" aria-label="Settings">
            <Button type="button" variant="ghost" size="icon-sm" onClick={onTheme} data-testid="theme-button" aria-label="Toggle theme" title="Toggle theme">
              <ToolIcon name={theme === 'light' ? 'moon' : 'theme'} />
            </Button>
          </div>
        </nav>

        {locked ? (
          <span className="ml-1 flex items-center gap-1.5 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-1 text-[10px] font-medium text-indigo-200" data-testid="lock-indicator" title="Drawing…">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300" />
            Drawing
          </span>
        ) : null}
      </header>

      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        onClick={onToggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="architecture-chat"
        data-testid="sidebar-toggle"
        className="fixed bottom-4 left-4 z-40 rounded-xl border-white/10 bg-[var(--paladin-frost)] shadow-xl backdrop-blur-xl"
      >
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </Button>
    </>
  );
}

function ExportItem({ testId, label, hint, onClick, onSelect }: { testId: string; label: string; hint: string; onClick: () => void; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        onClick();
      }}
      data-testid={testId}
      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-zinc-100 transition-colors hover:bg-white/[0.06]"
    >
      <span className="font-medium">{label}</span>
      <small className="text-[10px] text-zinc-500">{hint}</small>
    </button>
  );
}
