import type {
  ArchitectureDraft,
  Component,
  Connection,
  Group,
} from '../types/architecture.generated';

/**
 * Layout is the only place coordinates exist. The architecture model has no
 * x, y, width or height field, and nothing here mutates the draft.
 */

export type AdjustmentKind =
  | 'group-parent'
  | 'group-membership'
  | 'unknown-member'
  | 'empty-group'
  | 'unknown-endpoint'
  | 'self-loop'
  | 'parallel-edges'
  | 'duplicate-component-name'
  | 'duplicate-connection-label'
  | 'duplicate-group-name';

export interface LayoutAdjustment {
  kind: AdjustmentKind;
  message: string;
  elementIds: string[];
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode extends LayoutBox {
  id: string;
  kind: 'component' | 'group';
  parentId: string | null;
  depth: number;
  /** Absolute position in the canvas, used by tests, focus and screenshots. */
  absoluteX: number;
  absoluteY: number;
  component?: Component;
  group?: Group;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  type: 'sync' | 'async';
  label: string;
  displayLabel: string;
  technology: string | null;
  assumed: boolean;
  /** ELK's routed points in canvas coordinates, or null when ELK gave none. */
  section: LayoutPoint[] | null;
  /** Reserved label box in canvas coordinates. */
  labelBox: LayoutBox;
}

export interface LayoutResult {
  title: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  adjustments: LayoutAdjustment[];
  width: number;
  height: number;
}

export interface NormalizedDraft {
  components: Component[];
  connections: Connection[];
  groups: NormalizedGroup[];
  adjustments: LayoutAdjustment[];
}

export interface NormalizedGroup {
  id: string;
  name: string;
  description: string;
  assumed: boolean;
  rationale: string | null;
  requirement_refs: string[];
  parentId: string | null;
  members: string[];
  source: Group;
}

export type { ArchitectureDraft, Component, Connection, Group };
