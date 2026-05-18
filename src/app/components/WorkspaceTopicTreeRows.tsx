import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';

import {
  resolveNodeTreeRowVirtualSize
} from '../../features/nodes/components/nodeListRowSpacingSettings';
import type { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from '../../features/nodes/components/NodeTreeRow';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { VirtualListSurface, type VirtualListRenderMeta } from '../../shared/ui';

import {
  resolveWorkspaceTopicTreeRowDragProps,
  resolveWorkspaceTopicTreeRowModel
} from './workspaceTopicTreeRowModel';
import { useWorkspaceTopicTreeRowScrollLayout } from './workspaceTopicTreeScrollPadding';

const TOPIC_TREE_VIRTUALIZATION_THRESHOLD = 20;

export type WorkspaceTopicTreeScrollPlacement = 'comfort' | 'second-visible-row' | 'near-visible-row';

interface WorkspaceTopicTreeRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  drag: ReturnType<typeof useNodeListDragController>;
  nodesById: WorkspaceListNodesById;
  onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
  scrollPlacement?: WorkspaceTopicTreeScrollPlacement;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollTargetNodeId?: string | null;
  selectedNodeIds: string[];
}

function resolveActiveRowIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  return activeNodeId ? rows.findIndex((row) => row.node.id === activeNodeId) : null;
}

function resolveSecondVisibleRowAnchorIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  const activeRowIndex = resolveActiveRowIndex(rows, activeNodeId);
  return activeRowIndex === null || activeRowIndex < 0 ? null : Math.max(activeRowIndex - 1, 0);
}

function resolveNearVisibleRowAnchorIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  const activeRowIndex = resolveActiveRowIndex(rows, activeNodeId);
  return activeRowIndex === null || activeRowIndex < 0 ? null : Math.max(activeRowIndex - 2, 0);
}

function resolveScrollAnchorIndex(
  rows: readonly NodeTreeRow[],
  scrollTargetNodeId: string | null,
  scrollPlacement: WorkspaceTopicTreeScrollPlacement | undefined
) {
  if (scrollPlacement === 'second-visible-row') {
    return resolveSecondVisibleRowAnchorIndex(rows, scrollTargetNodeId);
  }
  if (scrollPlacement === 'near-visible-row') {
    return resolveNearVisibleRowAnchorIndex(rows, scrollTargetNodeId);
  }
  return null;
}

function renderWorkspaceTopicTreeRow(
  row: NodeTreeRow,
  args: {
    activeNodeId: string | null;
    collapsedNodeIds: ReadonlySet<string>;
    drag: ReturnType<typeof useNodeListDragController>;
    nodesById: WorkspaceListNodesById;
    onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
    onRenameNode: (nodeId: string, title: string) => void;
    onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
    onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
    onToggleCollapse: (nodeId: string) => void;
    rowSpacing: number;
    selectedNodeIds: string[];
    meta?: VirtualListRenderMeta;
  }
) {
  const rowModel = resolveWorkspaceTopicTreeRowModel(row, args);

  return (
    <NodeTreeRowItem
      descendantCount={row.descendantCount}
      depth={row.depth}
      hasChildren={row.hasChildren}
      isActive={args.activeNodeId === row.node.id}
      isBulkSelectionActive={args.selectedNodeIds.length > 1}
      isCollapsed={args.collapsedNodeIds.has(row.node.id)}
      isDerived={rowModel.isDerivedNode}
      isMuted={rowModel.shouldFadeWholeRow}
      mutedOpacity={rowModel.mutedOpacity}
      isSelected={rowModel.isSelected}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      {...(args.meta ? { ariaPosInSet: args.meta.ariaPosInSet, ariaSetSize: args.meta.ariaSetSize } : {})}
      nodeIconKind={rowModel.nodeIconKind}
      nodeIconState={rowModel.nodeIconState}
      showIcon
      rowSpacing={args.rowSpacing}
      {...definedProps({ onContextMenu: args.onContextMenu })}
      {...resolveWorkspaceTopicTreeRowDragProps(row.node.id, rowModel.isDerivedNode, args.drag)}
      onKeyDown={args.onRowKeyDown}
      onRename={args.onRenameNode}
      onSelect={args.onSelectNode}
      onToggleCollapse={args.onToggleCollapse}
    />
  );
}

function renderWorkspaceTopicTreeVirtualList(args: WorkspaceTopicTreeRowsProps & {
  onRowKeyDown: ReturnType<typeof createNodeListRowKeydownHandler>;
  rowGap: number;
  rowSpacing: number;
}) {
  const scrollTargetNodeId = args.scrollTargetNodeId ?? args.activeNodeId;
  return (
    <VirtualListSurface
      autoScroll={args.scrollPlacement === 'second-visible-row' || args.scrollPlacement === 'near-visible-row'}
      estimateSize={(index) => resolveNodeTreeRowVirtualSize(args.rowSpacing, index === args.rows.length - 1 ? 0 : args.rowGap)}
      getItemKey={(row) => row.node.id}
      items={args.rows}
      renderItem={(row, meta) =>
        renderWorkspaceTopicTreeRow(row, {
          activeNodeId: args.activeNodeId,
          collapsedNodeIds: args.collapsedNodeIds,
          drag: args.drag,
          meta,
          nodesById: args.nodesById,
          onContextMenu: args.onContextMenu,
          onRenameNode: args.onRenameNode,
          onRowKeyDown: args.onRowKeyDown,
          onSelectNode: args.onSelectNode,
          onToggleCollapse: args.onToggleCollapse,
          rowSpacing: args.rowSpacing,
          selectedNodeIds: args.selectedNodeIds
        })}
      scrollAnchorIndex={resolveScrollAnchorIndex(args.rows, scrollTargetNodeId, args.scrollPlacement)}
      scrollElementRef={args.scrollContainerRef}
      scrollToIndex={resolveActiveRowIndex(args.rows, scrollTargetNodeId)}
      threshold={TOPIC_TREE_VIRTUALIZATION_THRESHOLD}
    />
  );
}

function renderWorkspaceTopicTreeRowsSection(args: {
  children: ReactNode;
  rowGap: number;
  rowSpacing: number;
  scrollPaddingBottom: number;
  scrollPaddingTop: number;
}) {
  return (
    <section
      aria-label="Topic list"
      className="flex flex-1 flex-col"
      data-node-list-row-gap={String(args.rowGap)}
      data-node-list-row-spacing={String(args.rowSpacing)}
      role="tree"
      style={{ gap: `${args.rowGap}px`, paddingBottom: args.scrollPaddingBottom, paddingTop: args.scrollPaddingTop }}
    >
      {args.children}
    </section>
  );
}

export function WorkspaceTopicTreeRows({
  activeNodeId,
  collapsedNodeIds,
  drag,
  nodesById,
  onContextMenu,
  onRenameNode,
  onSelectNode,
  onToggleCollapse,
  rows,
  scrollPlacement,
  scrollContainerRef,
  scrollTargetNodeId,
  selectedNodeIds
}: WorkspaceTopicTreeRowsProps) {
  const { rowGap, rowSpacing, scrollPaddingBottom, scrollPaddingTop } = useWorkspaceTopicTreeRowScrollLayout({
    activeNodeId,
    rows,
    scrollContainerRef,
    scrollPlacement,
    scrollTargetNodeId
  });
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds,
        onSelect: onSelectNode,
        onToggleCollapse,
        rows
      }),
    [collapsedNodeIds, onSelectNode, onToggleCollapse, rows]
  );

  return renderWorkspaceTopicTreeRowsSection({
    rowGap,
    rowSpacing,
    scrollPaddingBottom,
    scrollPaddingTop,
    children: renderWorkspaceTopicTreeVirtualList({
        activeNodeId,
        collapsedNodeIds,
        drag,
        nodesById,
        onContextMenu,
        onRenameNode,
        onRowKeyDown,
        onSelectNode,
        onToggleCollapse,
        rowGap,
        rows,
        rowSpacing,
        scrollContainerRef,
        selectedNodeIds,
        ...definedProps({ scrollPlacement, scrollTargetNodeId })
      })
  });
}
