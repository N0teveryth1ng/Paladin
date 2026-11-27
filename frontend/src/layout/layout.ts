import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs';

import type {
  ArchitectureDraft,
  Connection,
  LayoutBox,
  LayoutEdge,
  LayoutNode,
  LayoutPoint,
  LayoutResult,
} from './layoutTypes';

export type {
  ArchitectureDraft,
  LayoutAdjustment,
  LayoutEdge,
  LayoutNode,
  LayoutPoint,
  LayoutResult,
} from './layoutTypes';
import { ELK_GROUP_OPTIONS, ELK_ROOT_OPTIONS } from './elkOptions';
import { normalizeDraft } from './normalize';
import {
  COMPONENT_HEIGHT,
  COMPONENT_WIDTH,
  edgeLabelHeight,
  edgeLabelWidth,
} from './nodeSizes';

/**
 * Pure, deterministic layout.
 *
 * The draft is normalised first, then handed to ELK's layered algorithm. The
 * same input always produces the same coordinates. Nothing here reads the DOM
 * or mutates the draft.
 */

const elk = new ELK();

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function layoutArchitecture(draft: ArchitectureDraft): Promise<LayoutResult> {
  const normalized = normalizeDraft(draft);

  const componentById = new Map(normalized.components.map((component) => [component.id, component]));
  const groupById = new Map(normalized.groups.map((group) => [group.id, group]));

  const memberOf = new Map<string, string>();
  for (const group of normalized.groups) {
    for (const member of group.members) {
      memberOf.set(member, group.id);
    }
  }

  const groupChildren = (groupId: string | null): ElkNode[] => {
    const childGroups = normalized.groups
      .filter((group) => group.parentId === groupId)
      .sort(byId)
      .map(
        (group): ElkNode => ({
          id: group.id,
          layoutOptions: { ...ELK_GROUP_OPTIONS },
          children: groupChildren(group.id),
        }),
      );

    const childComponents = normalized.components
      .filter((component) => (memberOf.get(component.id) ?? null) === groupId)
      .sort(byId)
      .map(
        (component): ElkNode => ({
          id: component.id,
          width: COMPONENT_WIDTH,
          height: COMPONENT_HEIGHT,
        }),
      );

    return [...childGroups, ...childComponents];
  };

  const edges: ElkExtendedEdge[] = normalized.connections.map((connection) => {
    const displayLabel = connection.label;
    return {
      id: connection.id,
      sources: [connection.from],
      targets: [connection.to],
      labels: [
        {
          text: displayLabel,
          width: edgeLabelWidth(displayLabel, connection.assumed),
          height: edgeLabelHeight(
            displayLabel,
            edgeLabelWidth(displayLabel, connection.assumed),
            connection.assumed,
          ),
        },
      ],
    };
  });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: { ...ELK_ROOT_OPTIONS },
    children: groupChildren(null),
    edges,
  };

  const laid = await elk.layout(graph);

  const nodes: LayoutNode[] = [];
  const walk = (
    children: ElkNode[] | undefined,
    parentAbsoluteX: number,
    parentAbsoluteY: number,
    depth: number,
  ): void => {
    for (const child of [...(children ?? [])].sort(byId)) {
      const x = child.x ?? 0;
      const y = child.y ?? 0;
      const absoluteX = parentAbsoluteX + x;
      const absoluteY = parentAbsoluteY + y;

      const component = componentById.get(child.id);
      if (component !== undefined) {
        nodes.push({
          id: child.id,
          kind: 'component',
          parentId: memberOf.get(child.id) ?? null,
          depth,
          x,
          y,
          width: COMPONENT_WIDTH,
          height: COMPONENT_HEIGHT,
          absoluteX,
          absoluteY,
          component,
        });
        continue;
      }

      const group = groupById.get(child.id);
      if (group !== undefined) {
        nodes.push({
          id: child.id,
          kind: 'group',
          parentId: group.parentId,
          depth,
          x,
          y,
          width: child.width ?? 0,
          height: child.height ?? 0,
          absoluteX,
          absoluteY,
          group: group.source,
        });
        walk(child.children, absoluteX, absoluteY, depth + 1);
      }
    }
  };
  walk(laid.children, 0, 0, 0);

  // React Flow requires a parent before its children. All groups come first,
  // ordered by depth and id; components follow, ordered by id.
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return byId(a, b);
  });

  const absoluteById = new Map(nodes.map((node) => [node.id, node]));

  const edgeMeta = new Map(normalized.connections.map((connection) => [connection.id, connection]));
  const layoutEdges: LayoutEdge[] = [...(laid.edges ?? [])]
    .sort(byId)
    .flatMap((edge, index) => {
      const meta = edgeMeta.get(edge.id);
      if (meta === undefined) {
        return [];
      }

      // ELK reports an edge in the coordinate system of its container: the
      // root, or the group that holds both endpoints. Convert once, here.
      const container = edge.container ?? 'root';
      const containerNode = container === 'root' ? undefined : absoluteById.get(container);
      const offsetX = containerNode?.absoluteX ?? 0;
      const offsetY = containerNode?.absoluteY ?? 0;
      const section = sectionPoints(edge);
      const absoluteSection =
        section === null
          ? null
          : section.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
      const displayLabel = meta.label;

      return [
        {
          id: edge.id,
          from: meta.from,
          to: meta.to,
          type: meta.type,
          label: meta.label,
          displayLabel,
          technology: meta.technology ?? null,
          assumed: meta.assumed,
          section: absoluteSection,
          labelBox: labelBoxFor(
            meta,
            displayLabel,
            absoluteSection,
            index,
            absoluteById,
            edge.labels?.[0],
            offsetX,
            offsetY,
          ),
        },
      ];
    });

  return {
    title: draft.title,
    nodes,
    edges: layoutEdges,
    adjustments: normalized.adjustments,
    width: laid.width ?? 0,
    height: laid.height ?? 0,
  };
}

function sectionPoints(edge: ElkExtendedEdge): LayoutPoint[] | null {
  if (edge.sections === undefined || edge.sections.length === 0) {
    return null;
  }

  const points: LayoutPoint[] = [];
  const push = (point: { x: number; y: number }): void => {
    const previous = points[points.length - 1];
    if (previous !== undefined && previous.x === point.x && previous.y === point.y) {
      return;
    }
    points.push({ x: point.x, y: point.y });
  };

  for (const section of edge.sections) {
    push(section.startPoint);
    for (const bend of section.bendPoints ?? []) {
      push(bend);
    }
    push(section.endPoint);
  }

  return points.length >= 2 ? points : null;
}

function polylineMidpoint(points: LayoutPoint[]): LayoutPoint {
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
    lengths.push(length);
    total += length;
  }

  let remaining = total / 2;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1];
    if (remaining <= length || index === points.length - 1) {
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio,
      };
    }
    remaining -= length;
  }

  return points[0];
}

function labelBoxFor(
  connection: Connection,
  displayLabel: string,
  section: LayoutPoint[] | null,
  index: number,
  nodes: Map<string, LayoutNode>,
  elkLabel: { x?: number; y?: number; width?: number; height?: number } | undefined,
  offsetX: number,
  offsetY: number,
): LayoutBox {
  const width = edgeLabelWidth(displayLabel, connection.assumed);
  const height = edgeLabelHeight(displayLabel, width, connection.assumed);

  if (elkLabel?.x !== undefined && elkLabel.y !== undefined) {
    return {
      x: elkLabel.x + offsetX,
      y: elkLabel.y + offsetY,
      width: elkLabel.width ?? width,
      height: elkLabel.height ?? height,
    };
  }

  let center: LayoutPoint;
  if (section !== null && section.length >= 2) {
    center = polylineMidpoint(section);
  } else if (connection.from === connection.to) {
    const node = nodes.get(connection.from);
    center =
      node === undefined
        ? { x: 0, y: 0 }
        : { x: node.absoluteX + node.width / 2, y: node.absoluteY - 24 };
  } else {
    const from = nodes.get(connection.from);
    const to = nodes.get(connection.to);
    center =
      from === undefined || to === undefined
        ? { x: 0, y: 0 }
        : {
            x: (from.absoluteX + from.width / 2 + to.absoluteX + to.width / 2) / 2,
            y: (from.absoluteY + from.height / 2 + to.absoluteY + to.height / 2) / 2,
          };
    center = { x: center.x, y: center.y + (index % 2 === 0 ? -8 : 8) };
  }

  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}
