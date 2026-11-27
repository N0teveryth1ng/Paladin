import type { CSSProperties } from 'react';
import type { Node, NodeProps } from '@xyflow/react';

import type { LayoutNode } from '../../layout/layoutTypes';
import { groupAccentFor } from '../theme';

export interface GroupNodeData extends Record<string, unknown> {
  node: LayoutNode;
  theme: 'light' | 'dark';
}

export type GroupFlowNode = Node<GroupNodeData, 'group'>;

export function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  const { node } = data;
  const group = node.group;
  if (group === undefined) {
    return null;
  }
  const accent = groupAccentFor(group.id);

  return (
    <div
      className={`group-node${group.assumed ? ' assumed' : ''}`}
      data-testid="group-node"
      data-group-id={group.id}
      role="group"
      aria-label={`${group.name}, group, ${group.members.length} members`}
      style={{
        width: node.width,
        height: node.height,
        borderColor: accent,
        background: `color-mix(in srgb, ${accent} 11%, var(--canvas-group-bg))`,
        '--group-accent': accent,
      } as CSSProperties}
    >
      <div className="group-header">
        <span className="group-name" title={group.name}>
          {group.name}
        </span>
        <span className="group-count">{group.members.length}</span>
      </div>
    </div>
  );
}
