'use client';

import { Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '../../components/ui/button';
import { Input, Textarea } from '../../components/ui/input';
import type { Component, ComponentType, Connection, ConnectionType, Group } from '../types/architecture.generated';
import type { Entry, ThemeName } from '../app/modes';
import type { Selection } from './selection';

const COMPONENT_TYPES: ComponentType[] = [
  'client', 'api_gateway', 'load_balancer', 'service', 'worker', 'database', 'cache',
  'message_queue', 'object_storage', 'cdn', 'auth_provider', 'search_index', 'scheduler',
  'external_service',
];

const fieldClass =
  'flex flex-col gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500';
const controlClass =
  'h-9 w-full rounded-xl border border-white/10 bg-zinc-950/50 px-3 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus-visible:border-indigo-400/50 focus-visible:ring-2 focus-visible:ring-indigo-400/15';

export function SidePanel({
  entry,
  selection = null,
  onChangeComponent = () => {},
  onChangeConnection = () => {},
  onChangeGroup = () => {},
  onClearSelection = () => {},
  onDelete = () => {},
}: {
  entry: Entry;
  selection?: Selection;
  result?: unknown;
  theme?: ThemeName;
  onSelect?: (selection: Selection) => void;
  onChangeComponent?: (id: string, patch: Partial<Component>) => void;
  onChangeConnection?: (id: string, patch: Partial<Connection>) => void;
  onChangeGroup?: (id: string, patch: Partial<Group>) => void;
  onClearSelection?: () => void;
  onDelete?: () => void;
}) {
  if (selection === null) return null;

  const component = selection.kind === 'component'
    ? entry.draft.components.find((item) => item.id === selection.id)
    : undefined;
  const connection = selection.kind === 'edge'
    ? (entry.draft.connections ?? []).find((item) => item.id === selection.id)
    : undefined;
  const group = selection.kind === 'group'
    ? (entry.draft.groups ?? []).find((item) => item.id === selection.id)
    : undefined;

  return (
    <aside
      className="absolute right-4 top-16 z-30 w-[268px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-2xl"
      data-testid="side-panel"
      aria-label="Selection inspector"
    >
      <div className="inspector-heading flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span>{selection.kind === 'edge' ? 'Connection' : selection.kind === 'group' ? 'Group' : 'Box'}</span>
        <button type="button" className="icon-button grid h-6 w-6 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/10 hover:text-white" onClick={onClearSelection} aria-label="Close inspector">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {component ? (
        <div className="inspector-fields flex flex-col gap-3 p-3.5">
          <label className={fieldClass}>Name<Input autoFocus value={component.name} className={controlClass} onChange={(event) => onChangeComponent(component.id, { name: event.target.value })} /></label>
          <label className={fieldClass}>Kind<select value={component.type} className={controlClass} onChange={(event) => onChangeComponent(component.id, { type: event.target.value as ComponentType })}>{COMPONENT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label>
          <label className={fieldClass}>Technology<Input value={component.technology ?? ''} placeholder="Optional" className={controlClass} onChange={(event) => onChangeComponent(component.id, { technology: event.target.value || null })} /></label>
          <label className={fieldClass}>Description<Textarea rows={3} className={`${controlClass} h-auto resize-y py-2`} value={component.description} onChange={(event) => onChangeComponent(component.id, { description: event.target.value })} /></label>
          <DeleteButton onClick={onDelete}>Delete box</DeleteButton>
        </div>
      ) : null}

      {connection ? (
        <div className="inspector-fields flex flex-col gap-3 p-3.5">
          <div className="connection-endpoints flex items-center gap-2 text-xs text-zinc-300">
            {entry.draft.components.find((item) => item.id === connection.from)?.name ?? connection.from}
            <span aria-hidden="true" className="text-indigo-300">→</span>
            {entry.draft.components.find((item) => item.id === connection.to)?.name ?? connection.to}
          </div>
          <label className={fieldClass}>Label<Input autoFocus value={connection.label} className={controlClass} onChange={(event) => onChangeConnection(connection.id, { label: event.target.value })} /></label>
          <label className={fieldClass}>Flow<select value={connection.type} className={controlClass} onChange={(event) => onChangeConnection(connection.id, { type: event.target.value as ConnectionType })}><option value="sync">Request / response</option><option value="async">Async</option></select></label>
          <DeleteButton onClick={onDelete}>Delete connection</DeleteButton>
        </div>
      ) : null}

      {group ? (
        <div className="inspector-fields flex flex-col gap-3 p-3.5">
          <label className={fieldClass}>Name<Input autoFocus value={group.name} className={controlClass} onChange={(event) => onChangeGroup(group.id, { name: event.target.value })} /></label>
          <label className={fieldClass}>Description<Textarea rows={3} className={`${controlClass} h-auto resize-y py-2`} value={group.description} onChange={(event) => onChangeGroup(group.id, { description: event.target.value })} /></label>
          <DeleteButton onClick={onDelete}>Delete group</DeleteButton>
        </div>
      ) : null}
    </aside>
  );
}

function DeleteButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="destructive" size="xs" className="delete-button mt-1 self-start" onClick={onClick}>
      <Trash2 className="h-3 w-3" aria-hidden="true" />
      {children}
    </Button>
  );
}
