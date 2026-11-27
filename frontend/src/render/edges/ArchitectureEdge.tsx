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

function ArrowHead({
  points,
  type,
}: {
  points: LayoutPoint[];
  type: 'sync' | 'async';
}) {
  if (points.length < 2) {
    return null;
  }

  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
  const size = 10;
  const spread = Math.PI / 7;
  const left = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  };
  const right = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  };

  if (type === 'sync') {
    return (
      <polygon
        className="edge-arrow edge-arrow-filled"
        points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
      />
    );
  }

  return (
    <path
      className="edge-arrow edge-arrow-open"
      d={`M ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y}`}
    />
  );
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
  } = props;

  if (data === undefined) {
    return null;
  }

  const edge = data.edge;
  const severity = worstSeverity(data.issues);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  const labelPoint = { x: labelX, y: labelY };
  const points: LayoutPoint[] = [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ];

  return (
    <g
      className={`architecture-edge edge-${edge.type}${selected ? ' selected' : ''}`}
      data-testid="architecture-edge"
      data-edge-id={edge.id}
      data-edge-type={edge.type}
      data-severity={severity ?? ''}
    >
      <BaseEdge path={path} className="edge-path" interactionWidth={20} />
      <ArrowHead points={points} type={edge.type} />

      <EdgeLabelRenderer>
        <div
          className={`edge-label${selected ? ' selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
          }}
          title={`${edge.label}${edge.technology !== null ? ` · ${edge.technology}` : ''}`}
        >
          {edge.assumed ? <span className="edge-assumed">A</span> : null}
          <span className="edge-label-text">{edge.displayLabel}</span>
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
