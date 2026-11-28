'use client';

import type { CSSProperties } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Layers3 } from 'lucide-react';

import { cn } from '../../../lib/utils';
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
      className={cn(
        'group-node relative h-full w-full rounded-lg border backdrop-blur-sm',
        'border-[color-mix(in_srgb,var(--group-accent)_55%,#3f3f46)] bg-[color-mix(in_srgb,var(--group-accent)_10%,rgba(18,18,20,0.72))]',
        group.assumed && 'assumed border-dashed',
      )}
      data-testid="group-node"
      data-group-id={group.id}
      role="group"
      aria-label={`${group.name}, group, ${group.members.length} members`}
      title="Double-click to focus this group"
      style={{
        width: node.width,
        height: node.height,
        borderColor: accent,
        '--group-accent': accent,
      } as CSSProperties}
    >
      <div className="group-header flex h-9 items-center gap-2 border-b border-white/[0.07] bg-white/[0.035] px-3.5">
        <Layers3 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
        <span className="group-name overflow-hidden text-[12px] font-semibold text-zinc-200 text-ellipsis whitespace-nowrap" title={group.name}>
          {group.name}
        </span>
        <span className="group-count rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
          {group.members.length}
        </span>
      </div>
    </div>
  );
}
