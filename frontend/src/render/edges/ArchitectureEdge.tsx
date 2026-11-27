import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

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
    // ELK fans parallel links out across a node's edge. React Flow reports
    // the center handle, so compare against the node boundary and allow any
    // routed attachment point along that boundary.
    && isOnNodeBoundary(section[0], sourceBounds)
    && isOnNodeBoundary(section[section.length - 1], targetBounds)
    // Reject the saved route after either endpoint has been dragged.
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
          data-edge-id={edge.id}
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
