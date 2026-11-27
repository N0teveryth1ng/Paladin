import type { Component, ComponentType, Connection, ConnectionType, Group } from '../types/architecture.generated';
import type { Entry, ThemeName } from '../app/modes';
import type { Selection } from './selection';

const COMPONENT_TYPES: ComponentType[] = [
  'client', 'api_gateway', 'load_balancer', 'service', 'worker', 'database', 'cache',
  'message_queue', 'object_storage', 'cdn', 'auth_provider', 'search_index', 'scheduler',
  'external_service',
];

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
    <aside className="inspector" data-testid="side-panel" aria-label="Selection inspector">
      <div className="inspector-heading">
        <span>{selection.kind === 'edge' ? 'Connection' : selection.kind === 'group' ? 'Group' : 'Box'}</span>
        <button type="button" className="icon-button" onClick={onClearSelection} aria-label="Close inspector">×</button>
      </div>

      {component ? (
        <div className="inspector-fields">
          <label>Name<input autoFocus value={component.name} onChange={(event) => onChangeComponent(component.id, { name: event.target.value })} /></label>
          <label>Kind<select value={component.type} onChange={(event) => onChangeComponent(component.id, { type: event.target.value as ComponentType })}>{COMPONENT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label>
          <label>Technology<input value={component.technology ?? ''} placeholder="Optional" onChange={(event) => onChangeComponent(component.id, { technology: event.target.value || null })} /></label>
          <label>Description<textarea rows={3} value={component.description} onChange={(event) => onChangeComponent(component.id, { description: event.target.value })} /></label>
          <button type="button" className="delete-button" onClick={onDelete}>Delete box</button>
        </div>
      ) : null}

      {connection ? (
        <div className="inspector-fields">
          <div className="connection-endpoints">
            {entry.draft.components.find((item) => item.id === connection.from)?.name ?? connection.from}
            <span aria-hidden="true">→</span>
            {entry.draft.components.find((item) => item.id === connection.to)?.name ?? connection.to}
          </div>
          <label>Label<input autoFocus value={connection.label} onChange={(event) => onChangeConnection(connection.id, { label: event.target.value })} /></label>
          <label>Flow<select value={connection.type} onChange={(event) => onChangeConnection(connection.id, { type: event.target.value as ConnectionType })}><option value="sync">Request / response</option><option value="async">Async</option></select></label>
          <button type="button" className="delete-button" onClick={onDelete}>Delete connection</button>
        </div>
      ) : null}

      {group ? (
        <div className="inspector-fields">
          <label>Name<input autoFocus value={group.name} onChange={(event) => onChangeGroup(group.id, { name: event.target.value })} /></label>
          <label>Description<textarea rows={3} value={group.description} onChange={(event) => onChangeGroup(group.id, { description: event.target.value })} /></label>
          <button type="button" className="delete-button" onClick={onDelete}>Delete group</button>
        </div>
      ) : null}
    </aside>
  );
}
