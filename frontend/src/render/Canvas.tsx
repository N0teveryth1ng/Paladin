import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';

import type { ThemeName } from '../app/modes';
import type { LayoutNode, LayoutResult } from '../layout/layoutTypes';
import type { DisplayIssue } from '../types/issues';
import { issuesFor } from '../types/issues';
import { ArchitectureEdge } from './edges/ArchitectureEdge';
import { ComponentNode } from './nodes/ComponentNode';
import { GroupNode } from './nodes/GroupNode';

export type SelectionKind = 'component' | 'group' | 'edge';

const nodeTypes = {
  component: ComponentNode,
  group: GroupNode,
} as unknown as NodeTypes;

const edgeTypes = {
  architecture: ArchitectureEdge,
} as unknown as EdgeTypes;

export interface CanvasProps {
  result: LayoutResult;
  issues: DisplayIssue[];
  theme: ThemeName;
  locked: boolean;
  focus: string | null;
  zoom: number | null;
  fitNonce: number;
  fixtureName: string;
  onSelect: (kind: SelectionKind, id: string) => void;
  onClearSelection: () => void;
  onReady: () => void;
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  result,
  issues,
  theme,
  locked,
  focus,
  zoom,
  fitNonce,
  fixtureName,
  onSelect,
  onClearSelection,
  onReady,
}: CanvasProps) {
  const [initialised, setInitialised] = useState(false);
  const [fitted, setFitted] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const nodes = useMemo<Node[]>(
    () =>
      result.nodes.map((layoutNode) => {
        const parentId = layoutNode.parentId ?? undefined;
        return {
          id: layoutNode.id,
          type: layoutNode.kind,
          position: { x: layoutNode.x, y: layoutNode.y },
          data:
            layoutNode.kind === 'component'
              ? {
                  node: layoutNode,
                  issues: issuesFor(issues, layoutNode.id),
                  theme,
                }
              : { node: layoutNode, theme },
          width: layoutNode.width,
          height: layoutNode.height,
          style: { width: layoutNode.width, height: layoutNode.height },
          draggable: false,
          selectable: !locked,
          parentId,
          zIndex: layoutNode.kind === 'group' ? 0 : 1,
        } satisfies Node;
      }),
    [result, issues, theme, locked],
  );

  const edges = useMemo<Edge[]>(
    () =>
      result.edges.map((layoutEdge, index) => ({
        id: layoutEdge.id,
        source: layoutEdge.from,
        target: layoutEdge.to,
        sourceHandle: 's',
        targetHandle: 't',
        type: 'architecture',
        data: {
          edge: layoutEdge,
          issues: issuesFor(issues, layoutEdge.id),
          parallelIndex: index,
        },
        selectable: !locked,
        focusable: !locked,
      })),
    [result, issues, locked],
  );

  const handleReady = useCallback(() => {
    setFitted(true);
    onReady();
  }, [onReady]);

  const focusBox = useMemo<LayoutNode | null>(() => {
    if (focus === null) {
      return null;
    }
    return result.nodes.find((node) => node.id === focus) ?? null;
  }, [focus, result]);

  return (
    <div
      className="canvas-wrap"
      data-testid="canvas"
      data-fixture={fixtureName}
      data-theme={theme}
      data-locked={locked ? '1' : '0'}
      data-layout-ready={fitted ? 'true' : 'false'}
      data-pan={locked ? '0' : '1'}
      data-zoom-enabled={locked ? '0' : '1'}
      data-selectable={locked ? '0' : '1'}
      data-focusable={locked ? '0' : '1'}
      data-draggable="0"
      data-connectable="0"
      data-viewport-zoom={viewport.zoom.toFixed(4)}
      data-viewport-transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={() => setInitialised(true)}
        onNodeClick={(_event, node) =>
          onSelect(node.type === 'group' ? 'group' : 'component', node.id)
        }
        onEdgeClick={(_event, edge) => onSelect('edge', edge.id)}
        onPaneClick={onClearSelection}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={!locked}
        nodesFocusable={!locked}
        edgesFocusable={!locked}
        disableKeyboardA11y={locked}
        panOnDrag={!locked}
        zoomOnScroll={!locked}
        zoomOnPinch={!locked}
        zoomOnDoubleClick={!locked}
        preventScrolling={!locked}
        minZoom={0.01}
        maxZoom={2}
        fitView={false}
        attributionPosition="bottom-left"
      >
        <Background gap={24} size={1} color="var(--canvas-dot)" />
        <ViewController
          initialised={initialised}
          focusBox={focusBox}
          zoom={zoom}
          fitNonce={fitNonce}
          onReady={handleReady}
          onViewport={setViewport}
        />
      </ReactFlow>
    </div>
  );
}

function ViewController({
  initialised,
  focusBox,
  zoom,
  fitNonce,
  onReady,
  onViewport,
}: {
  initialised: boolean;
  focusBox: LayoutNode | null;
  zoom: number | null;
  fitNonce: number;
  onReady: () => void;
  onViewport: (viewport: { x: number; y: number; zoom: number }) => void;
}) {
  const { fitView, setCenter, getViewport } = useReactFlow();

  useEffect(() => {
    if (!initialised) {
      return;
    }

    const apply = (): void => {
      if (focusBox !== null && zoom !== null) {
        setCenter(
          focusBox.absoluteX + focusBox.width / 2,
          focusBox.absoluteY + focusBox.height / 2,
          { zoom, duration: 0 },
        );
      } else {
        fitView({ padding: 0.12, duration: 0 });
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onViewport(getViewport());
          onReady();
        });
      });
    };

    const handle = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(handle);
  }, [
    initialised,
    focusBox,
    zoom,
    fitNonce,
    fitView,
    setCenter,
    getViewport,
    onViewport,
    onReady,
  ]);

  return null;
}
