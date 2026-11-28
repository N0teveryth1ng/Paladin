'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

import { cn } from '../../../lib/utils';
import type { LayoutBox, LayoutEdge, LayoutPoint } from '../../layout/layoutTypes';
import type { DisplayIssue } from '../../types/issues';
import { worstSeverity } from '../../types/issues';

export interface ArchitectureEdgeData extends Record<string, unknown> {
  edge: LayoutEdge;
  issues: DisplayIssue[];
  parallelIndex: number;
  sourceBounds: LayoutBox | null;
  targetBounds: LayoutBox | null;
}

export type ArchitectureFlowEdge = Edge<ArchitectureEdgeData, 'architecture'>;

const HANDLE_ALIGNMENT_TOLERANCE = 6;

function isOnNodeBoundary(point: LayoutPoint, bounds: LayoutBox): boolean {
  const tolerance = HANDLE_ALIGNMENT_TOLERANCE;
  const insideX = point.x >= bounds.x - tolerance
    && point.x <= bounds.x + bounds.width + tolerance;
  const insideY = point.y >= bounds.y - tolerance
    && point.y <= bounds.y + bounds.height + tolerance;
  const onVerticalSide = Math.abs(point.x - bounds.x) <= tolerance
    || Math.abs(point.x - (bounds.x + bounds.width)) <= tolerance;
  const onHorizontalSide = Math.abs(point.y - bounds.y) <= tolerance
    || Math.abs(point.y - (bounds.y + bounds.height)) <= tolerance;
  return insideX && insideY && (onVerticalSide || onHorizontalSide);
}

export function ArchitectureEdge(props: EdgeProps<ArchitectureFlowEdge>) {
  const {
    data,
    selected,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
  } = props;

  if (data === undefined) return null;

  const edge = data.edge;
  const severity = worstSeverity(data.issues);
  const section = edge.section;
  const sourceBounds = data.sourceBounds;
  const targetBounds = data.targetBounds;
  const routeMatchesNodes = section !== null && section.length >= 2
    && sourceBounds !== null && targetBounds !== null
    && isOnNodeBoundary(section[0], sourceBounds)
    && isOnNodeBoundary(section[section.length - 1], targetBounds)
    && Math.abs(sourceX - (sourceBounds.x + sourceBounds.width)) <= HANDLE_ALIGNMENT_TOLERANCE
    && Math.abs(targetX - targetBounds.x) <= HANDLE_ALIGNMENT_TOLERANCE
    && sourceY >= sourceBounds.y - HANDLE_ALIGNMENT_TOLERANCE
    && sourceY <= sourceBounds.y + sourceBounds.height + HANDLE_ALIGNMENT_TOLERANCE
    && targetY >= targetBounds.y - HANDLE_ALIGNMENT_TOLERANCE
    && targetY <= targetBounds.y + targetBounds.height + HANDLE_ALIGNMENT_TOLERANCE;
  const [fallbackPath, fallbackLabelX, fallbackLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
  const path = routeMatchesNodes
    ? pointsToPath(section as LayoutPoint[])
    : fallbackPath;
  const labelX = routeMatchesNodes
    ? edge.labelBox.x + edge.labelBox.width / 2
    : fallbackLabelX;
  const labelY = routeMatchesNodes
    ? edge.labelBox.y + edge.labelBox.height / 2
    : fallbackLabelY;

  return (
    <g
      className={cn('architecture-edge', `edge-${edge.type}`, selected && 'selected')}
      data-testid="architecture-edge"
      data-edge-id={edge.id}
      data-edge-type={edge.type}
      data-severity={severity ?? ''}
    >
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        className={cn(
          'edge-path stroke-zinc-500 [stroke-width:2.4px]',
          edge.type === 'async' && 'edge-async [stroke-dasharray:7_5]',
          edge.type === 'sync' && 'edge-sync',
          selected && 'stroke-indigo-400 [stroke-width:3px]',
        )}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'edge-label absolute flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-zinc-950/90 px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 shadow-xl backdrop-blur-xl',
            selected && 'border-indigo-400/50 ring-2 ring-indigo-400/20',
          )}
          data-edge-id={edge.id}
          style={{
            width: Math.max(96, edge.labelBox.width),
            minHeight: Math.max(32, edge.labelBox.height),
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          title={`${edge.label}${edge.technology !== null ? ` · ${edge.technology}` : ''} · Double-click to focus`}
        >
          {edge.assumed ? <span className="edge-assumed rounded bg-amber-400/15 px-1 py-0.5 text-[8px] uppercase tracking-wide text-amber-300">Assumed</span> : null}
          <span className="edge-label-text min-w-0">{edge.displayLabel}</span>
          {severity !== null ? (
            <span
              className={cn(
                'severity-dot severity-' + severity,
                'h-1.5 w-1.5 shrink-0 rounded-full',
                severity === 'invalid' ? 'bg-red-400' : 'bg-amber-400',
              )}
              aria-label={`${severity} issue`}
            />
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}

function pointsToPath(points: LayoutPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}
