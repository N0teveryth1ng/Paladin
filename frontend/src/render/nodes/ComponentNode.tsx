'use client';

import type { CSSProperties } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  Box,
  Clock,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  MessageSquare,
  Monitor,
  Network,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '../../../lib/utils';
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

const TYPE_ICONS: Record<ComponentType, LucideIcon> = {
  client: Monitor,
  api_gateway: Network,
  load_balancer: Network,
  service: Box,
  worker: Cpu,
  database: Database,
  cache: Layers,
  message_queue: MessageSquare,
  object_storage: HardDrive,
  cdn: Globe,
  auth_provider: ShieldCheck,
  search_index: Search,
  scheduler: Clock,
  external_service: Cloud,
};

export function ComponentNode({ data }: NodeProps<ComponentFlowNode>) {
  const { node, issues, theme } = data;
  const component = node.component;
  if (component === undefined) {
    return null;
  }

  const accent = accentFor(component.type, theme);
  const severity = worstSeverity(issues);
  const Icon = TYPE_ICONS[component.type];

  return (
    <div
      className={cn(
        'component-node group relative flex h-full w-full items-stretch overflow-hidden rounded-lg border text-white shadow-[0_12px_36px_-18px_rgba(0,0,0,0.95)] backdrop-blur-xl transition-all',
        'border-[color-mix(in_srgb,var(--component-accent)_58%,var(--color-zinc-700))] bg-[color-mix(in_srgb,var(--component-accent)_8%,var(--color-zinc-900))]',
        component.assumed && 'assumed border-dashed',
        data.connectedToSelection && 'connected-to-selection ring-2 ring-indigo-400/70',
      )}
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
      <Handle
        type="target"
        position={Position.Left}
        id="t"
        className="paladin-handle !h-2 !w-2 !rounded-full !border !border-zinc-950 !bg-indigo-400 opacity-0 transition-opacity group-hover:opacity-100"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="s"
        className="paladin-handle !h-2 !w-2 !rounded-full !border !border-zinc-950 !bg-indigo-400 opacity-0 transition-opacity group-hover:opacity-100"
      />

      <span
        className="component-icon ml-3.5 mt-auto mb-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] backdrop-blur"
        style={{ color: accent }}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <div className="component-body flex min-w-0 flex-1 flex-col justify-center gap-2 py-3 pl-3.5 pr-4">
        <div className="component-name overflow-hidden text-[14px] font-semibold leading-tight tracking-tight text-zinc-50" title={component.name}>
          {component.name}
        </div>
        <div className="component-meta flex min-w-0 items-center gap-2 text-[10px]">
          <span className="component-type shrink-0 font-medium capitalize text-zinc-400">{typeLabel(component.type)}</span>
          {component.technology !== null && component.technology !== undefined ? (
            <span className="component-tech overflow-hidden text-ellipsis whitespace-nowrap text-zinc-500" title={component.technology}>
              <span className="pr-1.5 text-zinc-600">•</span>
              {component.technology}
            </span>
          ) : null}
        </div>
      </div>

      {component.assumed ? (
        <span className="assumed-pill absolute right-2 top-2 rounded-full border border-dashed border-zinc-500/60 bg-[var(--paladin-frost-strong)] px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-zinc-400">
          assumed
        </span>
      ) : null}
      {severity !== null ? (
        <span
          className={cn(
            'severity-dot severity-' + severity,
            'absolute bottom-2 right-2 h-2 w-2 rounded-full ring-2 ring-zinc-900',
            severity === 'invalid' ? 'bg-red-400' : 'bg-amber-400',
          )}
          title={`${severity} issue on this component`}
          aria-label={`${severity} issue`}
        />
      ) : null}
    </div>
  );
}
