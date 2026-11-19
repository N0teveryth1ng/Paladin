import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import type { LayoutNode } from '../../layout/layoutTypes';
import type { DisplayIssue } from '../../types/issues';
import { worstSeverity } from '../../types/issues';
import { accentFor, glyphFor, typeLabel } from '../theme';

export interface ComponentNodeData extends Record<string, unknown> {
  node: LayoutNode;
  issues: DisplayIssue[];
  theme: 'light' | 'dark';
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
      className={`component-node${component.assumed ? ' assumed' : ''}`}
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
        borderColor: component.assumed ? accent : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} id="t" className="paladin-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="s" className="paladin-handle" isConnectable={false} />

      <span className="component-band" style={{ background: accent }} aria-hidden="true" />

      <div className="component-body">
        <div className="component-name" title={component.name}>
          {component.name}
        </div>
        <div className="component-meta">
          <span className="type-badge" style={{ background: accent }} aria-hidden="true">
            {glyphFor(component.type)}
          </span>
          <span className="component-type">{typeLabel(component.type)}</span>
        </div>
        {component.technology !== null && component.technology !== undefined ? (
          <div className="component-tech" title={component.technology}>
            {component.technology}
          </div>
        ) : (
          <div className="component-tech muted">no technology</div>
        )}
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
