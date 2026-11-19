import {
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

function toPath(points: LayoutPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

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
  const labelPoint = {
    x: edge.labelBox.x + edge.labelBox.width / 2,
    y: edge.labelBox.y + edge.labelBox.height / 2,
  };

  let path: string;
  let points: LayoutPoint[];

  if (edge.section !== null && edge.section.length >= 2) {
    points = edge.section;
    path = toPath(points);
  } else if (edge.from === edge.to) {
    points = [
      { x: sourceX, y: sourceY },
      { x: sourceX + 70, y: sourceY - 70 },
      { x: sourceX - 70, y: sourceY - 70 },
      { x: sourceX, y: sourceY },
    ];
    path = `M ${sourceX} ${sourceY} C ${sourceX + 70} ${sourceY - 70}, ${sourceX - 70} ${
      sourceY - 70
    }, ${sourceX} ${sourceY}`;
  } else {
    const [smoothPath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    path = smoothPath;
    points = [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ];
  }

  return (
    <g
      className={`architecture-edge edge-${edge.type}${selected ? ' selected' : ''}`}
      data-testid="architecture-edge"
      data-edge-id={edge.id}
      data-edge-type={edge.type}
      data-severity={severity ?? ''}
    >
      <path className="edge-interaction" d={path} fill="none" stroke="transparent" strokeWidth={20} />
      <path className="edge-path" d={path} fill="none" />
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
