import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

import type { LayoutEdge, LayoutPoint } from '../../layout/layoutTypes';
import type { DisplayIssue } from '../../types/issues';
import { worstSeverity } from '../../types/issues';

export interface ArchitectureEdgeData extends Record<string, unknown> {
  edge: LayoutEdge;
  issues: DisplayIssue[];
  parallelIndex: number;
}

export type ArchitectureFlowEdge = Edge<ArchitectureEdgeData, 'architecture'>;

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
  const routeMatchesNodes = section !== null && section.length >= 2
    && Math.abs(section[0].x - sourceX) < 2
    && Math.abs(section[0].y - sourceY) < 2
    && Math.abs(section[section.length - 1].x - targetX) < 2
    && Math.abs(section[section.length - 1].y - targetY) < 2;
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
      className={`architecture-edge edge-${edge.type}${selected ? ' selected' : ''}`}
      data-testid="architecture-edge"
      data-edge-id={edge.id}
      data-edge-type={edge.type}
      data-severity={severity ?? ''}
    >
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        className="edge-path"
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label${selected ? ' selected' : ''}`}
          style={{
            width: Math.max(96, edge.labelBox.width),
            minHeight: Math.max(32, edge.labelBox.height),
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          title={`${edge.label}${edge.technology !== null ? ` · ${edge.technology}` : ''}`}
        >
          {edge.assumed ? <span className="edge-assumed">Assumed</span> : null}
          <span className="edge-label-text">{edge.label}</span>
          {severity !== null ? (
            <span
              className={`severity-dot severity-${severity}`}
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
