import type { CSSProperties } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import type { LayoutNode } from '../../layout/layoutTypes';
import type { ComponentType } from '../../types/architecture.generated';
import type { DisplayIssue } from '../../types/issues';
import { worstSeverity } from '../../types/issues';
import { accentFor, typeLabel } from '../theme';

export interface ComponentNodeData extends Record<string, unknown> {
  node: LayoutNode;
  issues: DisplayIssue[];
  theme: 'light' | 'dark';
  connectedToSelection?: boolean;
}

export type ComponentFlowNode = Node<ComponentNodeData, 'component'>;

export function ComponentNode({ data }: NodeProps<ComponentFlowNode>) {
  const { node, issues, theme } = data;
  const component = node.component;
  if (component === undefined) {
    return null;
  }

  const accent = accentFor(component.type, theme);
  const severity = worstSeverity(issues);

  return (
    <div
      className={`component-node${component.assumed ? ' assumed' : ''}${data.connectedToSelection ? ' connected-to-selection' : ''}`}
      data-testid="component-node"
      data-component-id={component.id}
      data-type={component.type}
      data-severity={severity ?? ''}
      role="group"
      aria-label={`${component.name}, ${typeLabel(component.type)}, ${
        component.technology ?? 'no technology'
      }`}
      style={{
        width: node.width,
        height: node.height,
        '--component-accent': accent,
      } as CSSProperties}
    >
      <Handle type="target" position={Position.Left} id="t" className="paladin-handle" />
      <Handle type="source" position={Position.Right} id="s" className="paladin-handle" />

      <span className="component-icon" style={{ color: accent }} aria-hidden="true">
        <TypeIcon type={component.type} />
      </span>
      <div className="component-body">
        <div className="component-name" title={component.name}>
          {component.name}
        </div>
        <div className="component-meta">
          <span className="component-type">{typeLabel(component.type)}</span>
          {component.technology !== null && component.technology !== undefined ? <span className="component-tech" title={component.technology}>{component.technology}</span> : null}
        </div>
      </div>

      {component.assumed ? <span className="assumed-pill">assumed</span> : null}
      {severity !== null ? (
        <span
          className={`severity-dot severity-${severity}`}
          title={`${severity} issue on this component`}
          aria-label={`${severity} issue`}
        />
      ) : null}
    </div>
  );
}

function TypeIcon({ type }: { type: ComponentType }) {
  if (type === 'client') {
    return <svg viewBox="0 0 20 20"><rect x="5.5" y="2.5" width="9" height="15" rx="2" /><path d="M8 14.5h4" /></svg>;
  }
  if (type === 'database' || type === 'cache' || type === 'search_index') {
    return <svg viewBox="0 0 20 20"><ellipse cx="10" cy="4.5" rx="6.5" ry="2.5" /><path d="M3.5 4.5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-10M3.5 9.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></svg>;
  }
  if (type === 'message_queue' || type === 'scheduler') {
    return <svg viewBox="0 0 20 20"><circle cx="5" cy="5" r="2" /><circle cx="15" cy="15" r="2" /><path d="M7 5h6a2 2 0 0 1 0 4H7a2 2 0 0 0 0 4h6" /></svg>;
  }
  if (type === 'auth_provider') {
    return <svg viewBox="0 0 20 20"><path d="M10 2.5 16 5v4.6c0 3.6-2.4 6.3-6 8-3.6-1.7-6-4.4-6-8V5z" /><path d="m7.5 9.8 1.7 1.7 3.5-3.6" /></svg>;
  }
  if (type === 'object_storage' || type === 'cdn' || type === 'external_service') {
    return <svg viewBox="0 0 20 20"><path d="M5.1 14.8h9.3a3 3 0 0 0 .3-6 4.9 4.9 0 0 0-9.4-.8 3.4 3.4 0 0 0-.2 6.8Z" /></svg>;
  }
  return <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="5" rx="1.3" /><rect x="3" y="12" width="14" height="5" rx="1.3" /><path d="M6 5.5h.1M6 14.5h.1" /></svg>;
}
