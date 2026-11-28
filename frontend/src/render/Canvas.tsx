import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  MarkerType,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  useEdgesState,
  useNodesState,
  type Connection as FlowConnection,
} from '@xyflow/react';

import type { ThemeName } from '../app/modes';
import type { LayoutNode, LayoutResult } from '../layout/layoutTypes';
import type { DisplayIssue } from '../types/issues';
import { issuesFor } from '../types/issues';
import { ComponentNode } from './nodes/ComponentNode';
import { GroupNode } from './nodes/GroupNode';
import type { Selection } from './selection';
import { ArchitectureEdge, type ArchitectureFlowEdge } from './edges/ArchitectureEdge';

export type SelectionKind = 'component' | 'group' | 'edge';
const EMPTY_POSITIONS: Record<string, { x: number; y: number }> = {};

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
  overviewNonce?: number;
  fixtureName: string;
  positions?: Record<string, { x: number; y: number }>;
  selection?: Selection;
  onSelect: (kind: SelectionKind, id: string) => void;
  onClearSelection: () => void;
  onPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onConnect?: (source: string, target: string) => void;
  onReconnect?: (edgeId: string, source: string, target: string) => void;
  onDelete?: (selection: Exclude<Selection, null>) => void;
  onDeleteMany?: (selections: Array<Exclude<Selection, null>>) => void;
  onDuplicate?: (ids: string[]) => void;
  onAlign?: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h' | 'distribute-v', ids: string[]) => void;
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
  overviewNonce = 0,
  fixtureName,
  positions = EMPTY_POSITIONS,
  selection = null,
  onSelect,
  onClearSelection,
  onPositionChange = () => {},
  onConnect = () => {},
  onReconnect = () => {},
  onDelete = () => {},
  onDeleteMany = () => {},
  onDuplicate = () => {},
  onAlign = () => {},
  onReady,
}: CanvasProps) {
  const [initialised, setInitialised] = useState(false);
  const [fitted, setFitted] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [showMinimap, setShowMinimap] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { getViewport, zoomTo, fitView, setCenter } = useReactFlow();
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (locked || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const current = getViewport().zoom;
    const next = Math.max(0.08, Math.min(2.5, current * Math.exp(-event.deltaY * 0.0012)));
    void zoomTo(next, { duration: 0 });
  }, [getViewport, locked, zoomTo]);

  const handleViewportMoveEnd = useCallback((
    _event: unknown,
    nextViewport: { x: number; y: number; zoom: number },
  ): void => {
    setViewport((current) => current.x === nextViewport.x
      && current.y === nextViewport.y
      && current.zoom === nextViewport.zoom
      ? current
      : nextViewport);
  }, []);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: { id: string }[] }) => {
    const ids = [...selectedNodes.map((n) => n.id), ...selectedEdges.map((e) => e.id)];
    setSelectedIds(ids);
  }, []);

  useEffect(() => {
    if (locked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (event.target as HTMLElement | null)?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const nodeIds = selectedIds.filter((id) => result.nodes.some((n) => n.id === id && n.kind !== 'group'));
        if (nodeIds.length > 0) onDuplicate(nodeIds);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [locked, selectedIds, result.nodes, onDuplicate]);

  const selectedEdge = selection?.kind === 'edge'
    ? result.edges.find((edge) => edge.id === selection.id)
    : undefined;
  const selectedEndpointIds = new Set(selectedEdge ? [selectedEdge.from, selectedEdge.to] : []);

  const initialNodes = useMemo<Node[]>(
    () =>
      result.nodes.map((layoutNode) => {
        const parentId = layoutNode.parentId ?? undefined;
        return {
          id: layoutNode.id,
          type: layoutNode.kind,
          position: positions[layoutNode.id] ?? { x: layoutNode.x, y: layoutNode.y },
          data:
            layoutNode.kind === 'component'
              ? {
                  node: layoutNode,
                  issues: issuesFor(issues, layoutNode.id),
                  theme,
                  connectedToSelection: selectedEndpointIds.has(layoutNode.id),
                }
              : { node: layoutNode, theme },
          width: layoutNode.width,
          height: layoutNode.height,
          style: { width: layoutNode.width, height: layoutNode.height },
          draggable: !locked,
          selectable: !locked,
          parentId,
          zIndex: layoutNode.kind === 'group' ? 0 : 1,
        } satisfies Node;
      }),
    [result, issues, theme, locked, positions, selection],
  );

  const initialEdges = useMemo<ArchitectureFlowEdge[]>(
    () => {
      const nodeById = new Map(result.nodes.map((node) => [node.id, node]));
      return result.edges.map((layoutEdge, parallelIndex) => {
        const source = nodeById.get(layoutEdge.from);
        const target = nodeById.get(layoutEdge.to);
        return ({
        id: layoutEdge.id,
        source: layoutEdge.from,
        target: layoutEdge.to,
        sourceHandle: 's',
        targetHandle: 't',
        type: 'architecture',
        markerEnd: { type: layoutEdge.type === 'sync' ? MarkerType.ArrowClosed : MarkerType.Arrow, color: 'var(--edge)' },
        className: `edge-${layoutEdge.type}`,
        style: {
          stroke: 'var(--edge)',
          strokeWidth: 1.7,
          strokeDasharray: layoutEdge.type === 'async' ? '5 4' : undefined,
        },
        data: {
          edge: layoutEdge,
          issues: issuesFor(issues, layoutEdge.id),
          parallelIndex,
          sourceBounds: source === undefined ? null : {
            x: source.absoluteX,
            y: source.absoluteY,
            width: source.width,
            height: source.height,
          },
          targetBounds: target === undefined ? null : {
            x: target.absoluteX,
            y: target.absoluteY,
            width: target.width,
            height: target.height,
          },
        },
        selectable: !locked,
        focusable: !locked,
        });
      });
    },
    [result, issues, locked],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArchitectureFlowEdge>(initialEdges);

  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);

  const handleConnect = useCallback((connection: FlowConnection) => {
    if (connection.source && connection.target) onConnect(connection.source, connection.target);
  }, [onConnect]);

  const handleReconnect = useCallback((oldEdge: any, newConnection: FlowConnection) => {
    if (oldEdge?.id && newConnection.source && newConnection.target) onReconnect(oldEdge.id, newConnection.source, newConnection.target);
  }, [onReconnect]);
  const handleReady = useCallback(() => {
    setFitted(true);
    onReadyRef.current();
  }, []);

  const focusNode = useCallback((nodeId: string): void => {
    const node = result.nodes.find((item) => item.id === nodeId);
    if (node === undefined) return;
    if (node.kind === 'group') {
      void fitView({ nodes: [{ id: node.id }], padding: 0.18, duration: 220, maxZoom: 1.2 });
      return;
    }
    setCenter(node.absoluteX + node.width / 2, node.absoluteY + node.height / 2, {
      zoom: Math.min(2, Math.max(1, getViewport().zoom * 1.5)),
      duration: 220,
    });
  }, [fitView, getViewport, result.nodes, setCenter]);

  const focusEdge = useCallback((edgeId: string): void => {
    const edge = result.edges.find((item) => item.id === edgeId);
    if (edge === undefined) return;
    setCenter(edge.labelBox.x + edge.labelBox.width / 2, edge.labelBox.y + edge.labelBox.height / 2, {
      zoom: Math.min(2.2, Math.max(1.05, getViewport().zoom * 1.6)),
      duration: 220,
    });
  }, [getViewport, result.edges, setCenter]);

  const focusBox = useMemo<LayoutNode | null>(() => {
    if (focus === null) {
      return null;
    }
    return result.nodes.find((node) => node.id === focus) ?? null;
  }, [focus, result]);

  const simplifyEdgeLabels = result.edges.length >= 24 && viewport.zoom < 0.55;

  return (
    <div
      className="canvas-wrap absolute inset-0 h-full w-full overflow-hidden"
      onWheel={handleWheel}
      data-testid="canvas"
      data-fixture={fixtureName}
      data-theme={theme}
      data-locked={locked ? '1' : '0'}
      data-layout-ready={fitted ? 'true' : 'false'}
      data-pan={locked ? '0' : '1'}
      data-zoom-enabled={locked ? '0' : '1'}
      data-selectable={locked ? '0' : '1'}
      data-focusable={locked ? '0' : '1'}
        data-draggable={locked ? '0' : '1'}
        data-connectable={locked ? '0' : '1'}
      data-viewport-zoom={viewport.zoom.toFixed(4)}
      data-edge-labels={simplifyEdgeLabels ? 'overview' : 'detail'}
      data-viewport-transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}
    >
      <div className="canvas-title pointer-events-none absolute left-5 top-5 z-20 flex max-w-[min(440px,calc(100%-40px))] items-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/70 px-2.5 py-1.5 text-[12px] text-zinc-200 shadow-xl backdrop-blur-xl" data-testid="canvas-title">
        <span className="text-indigo-300" aria-hidden="true">⌑</span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{result.title}</span>
      </div>
      {result.nodes.length === 0 ? (
        <div className="empty-state pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center text-[13px] text-zinc-500" aria-hidden="true">
          <span className="empty-mark mb-1 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-zinc-900/70 text-lg text-indigo-300 backdrop-blur">＋</span>
          <span className="text-zinc-300">Your canvas is ready</span>
          <small className="text-[11px] text-zinc-600">Add a box or describe a system below</small>
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={() => setInitialised(true)}
        onNodeClick={(_event, node) =>
          onSelect(node.type === 'group' ? 'group' : 'component', node.id)
        }
        onNodeDoubleClick={(_event, node) => { if (!locked) focusNode(node.id); }}
        onEdgeClick={(_event, edge) => onSelect('edge', edge.id)}
        onEdgeDoubleClick={(_event, edge) => { if (!locked) focusEdge(edge.id); }}
        onPaneClick={onClearSelection}
        onNodeDragStop={(_event, node) => onPositionChange(node.id, node.position)}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onSelectionChange={handleSelectionChange}
        onMoveEnd={handleViewportMoveEnd}
        onNodesDelete={(deleted) => {
          const targets = deleted.filter((n) => n.type === 'component' || n.type === 'group').map((n) => ({ kind: n.type as 'component' | 'group', id: n.id }));
          if (targets.length > 1) onDeleteMany(targets);
          else if (targets[0]) onDelete(targets[0]);
        }}
        onEdgesDelete={(deleted) => {
          const targets = deleted.map((e) => ({ kind: 'edge' as const, id: e.id }));
          if (targets.length > 1) onDeleteMany(targets);
          else if (targets[0]) onDelete(targets[0]);
        }}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        edgesReconnectable={!locked}
        elementsSelectable={!locked}
        nodesFocusable={!locked}
        edgesFocusable={!locked}
        disableKeyboardA11y={locked}
        panOnDrag={!locked}
        zoomOnScroll={false}
        zoomOnPinch={!locked}
        zoomOnDoubleClick={!locked}
        preventScrolling={!locked}
        selectionOnDrag={false}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        snapToGrid={snapToGrid}
        snapGrid={[16, 16]}
        minZoom={0.08}
        maxZoom={2.5}
        fitView={false}
        attributionPosition="bottom-left"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#333" />
        {showMinimap ? (
          <MiniMap
            pannable
            zoomable
            className="!bottom-[7.5rem] !right-3 !h-28 !w-44 !rounded-xl !border !border-white/10 !bg-zinc-950/90 !shadow-2xl"
            nodeColor={(n) => n.type === 'group' ? 'rgba(129,140,248,.45)' : 'rgba(161,161,170,.35)'}
            maskColor="rgba(0,0,0,.6)"
          />
        ) : null}
        <ViewController
          initialised={initialised}
          focusBox={focusBox}
          zoom={zoom}
          fitNonce={fitNonce}
          overviewNonce={overviewNonce}
          onReady={handleReady}
          onViewport={setViewport}
        />
      </ReactFlow>
      <div className="canvas-overlay-controls absolute bottom-3 right-3 z-30 flex flex-col gap-1.5" aria-label="Canvas controls">
        {[
          { label: showMinimap ? 'Hide minimap' : 'Minimap', onClick: () => setShowMinimap((v) => !v) },
          { label: snapToGrid ? 'Snap: on' : 'Snap: off', onClick: () => setSnapToGrid((v) => !v) },
          { label: '50%', onClick: () => void zoomTo(0.5, { duration: 120 }) },
          { label: '100%', onClick: () => void zoomTo(1, { duration: 120 }) },
          { label: '150%', onClick: () => void zoomTo(1.5, { duration: 120 }) },
        ].map((control) => (
          <button
            key={control.label}
            type="button"
            onClick={control.onClick}
            className="rounded-lg border border-white/10 bg-zinc-950/85 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 shadow-xl backdrop-blur-xl transition-colors hover:border-indigo-400/30 hover:text-white"
          >
            {control.label}
          </button>
        ))}
      </div>
      {selectedIds.filter((id) => result.nodes.some((n) => n.id === id && n.kind === 'component')).length >= 2 ? (
        <div className="canvas-align-bar absolute bottom-3 left-3 z-30 flex max-w-[min(520px,calc(100%-220px))] flex-wrap gap-1" aria-label="Alignment tools">
          {(['left','center','right','top','middle','bottom','distribute-h','distribute-v'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onAlign(mode, selectedIds.filter((id) => result.nodes.some((n) => n.id === id && n.kind === 'component')))}
              className="rounded-lg border border-white/10 bg-zinc-950/85 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 shadow-xl backdrop-blur-xl transition-colors hover:border-indigo-400/30 hover:text-white"
            >
              {mode}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onDuplicate(selectedIds.filter((id) => result.nodes.some((n) => n.id === id && n.kind === 'component')))}
            className="rounded-lg border border-indigo-400/25 bg-indigo-500/15 px-2.5 py-1.5 text-[10px] font-medium text-indigo-200 shadow-xl backdrop-blur-xl transition-colors hover:bg-indigo-500/25"
          >
            Duplicate
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ViewController({
  initialised,
  focusBox,
  zoom,
  fitNonce,
  overviewNonce,
  onReady,
  onViewport,
}: {
  initialised: boolean;
  focusBox: LayoutNode | null;
  zoom: number | null;
  fitNonce: number;
  overviewNonce: number;
  onReady: () => void;
  onViewport: (viewport: { x: number; y: number; zoom: number }) => void;
}) {
  const { fitView, setCenter, getViewport } = useReactFlow();
  useEffect(() => {
    if (!initialised) {
      return;
    }

    const apply = async (): Promise<void> => {
      if (focusBox !== null && zoom !== null) {
        setCenter(
          focusBox.absoluteX + focusBox.width / 2,
          focusBox.absoluteY + focusBox.height / 2,
          { zoom, duration: 0 },
        );
      } else {
        await fitView({ padding: 0.12, duration: 0, maxZoom: 1.15 });
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
    overviewNonce,
    fitView,
    setCenter,
    getViewport,
    onViewport,
    onReady,
  ]);

  return null;
}
