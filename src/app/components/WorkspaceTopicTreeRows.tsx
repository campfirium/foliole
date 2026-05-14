import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

import {
  getDismissedFadeOpacity,
  shouldFadeDismissedWholeRow
} from '../../features/nodes/components/nodeIconAppearanceSettings';
import {
  getNodeListRowSpacing,
  resolveNodeListRowGap
} from '../../features/nodes/components/nodeListRowSpacingSettings';
import type { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from '../../features/nodes/components/NodeTreeRow';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState, type NodeTreeRowIconKind } from '../../features/nodes/components/NodeTreeRowIconModel';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isFsrsWorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { VirtualListSurface, type VirtualListRenderMeta } from '../../shared/ui';

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
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectedNodeIds: string[];
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
      mutedOpacity={rowModel.shouldFadeWholeRow ? getDismissedFadeOpacity(rowModel.leafIconKind) : 1}
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

function resolveWorkspaceTopicTreeRowModel(
  row: NodeTreeRow,
  args: Parameters<typeof renderWorkspaceTopicTreeRow>[1]
) {
  const node = args.nodesById[row.node.id];
  const isSelected = args.selectedNodeIds.includes(row.node.id);
  const isDerivedNode = Boolean(node?.anchorLink);
  const isReviewCard = isFsrsWorkspaceListNode(node);
  const nodeIconState = resolveNodeTreeRowIconState({
    isDismissed: node?.reading?.state === 'dismissed',
    hasEnteredSchedule: resolveHasEnteredSchedule(node, isReviewCard)
  });
  const nodeIconKind = resolveNodeTreeRowIconKind({
    hasChildren: row.hasChildren,
    isCollapsed: args.collapsedNodeIds.has(row.node.id),
    isReviewCard,
    kind: node?.kind ?? 'topic'
  });
  const leafIconKind = resolveLeafIconKind(nodeIconKind);
  const shouldFadeWholeRow = nodeIconState === 'dismissed' && shouldFadeDismissedWholeRow(leafIconKind);

  return { isDerivedNode, isSelected, leafIconKind, nodeIconKind, nodeIconState, shouldFadeWholeRow };
}

function resolveHasEnteredSchedule(
  node: WorkspaceListNodesById[string] | undefined,
  isReviewCard: boolean
) {
  return isReviewCard
    ? node?.review?.lastReviewAt !== null && node?.review?.lastReviewAt !== undefined
    : (node?.reading?.repetitionCount ?? 0) > 0;
}

function resolveWorkspaceTopicTreeRowDragProps(
  nodeId: string,
  isDerivedNode: boolean,
  drag: ReturnType<typeof useNodeListDragController>
) {
  return {
    dropIntent: drag.dropTargetNodeId === nodeId ? drag.dropIntent : null,
    isDragDisabled: isDerivedNode,
    isDropTarget: drag.dropTargetNodeId === nodeId,
    onDragEnd: drag.onDragEnd,
    onDragEnter: drag.onDragEnterNode,
    onDragOver: drag.onDragOverNode,
    onDragStart: drag.onDragStartNode,
    onDrop: drag.onDropOnNode
  };
}

function resolveLeafIconKind(kind: NodeTreeRowIconKind) {
  return kind === 'reading' || kind === 'review' ? kind : undefined;
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
  scrollContainerRef,
  selectedNodeIds
}: WorkspaceTopicTreeRowsProps) {
  const rowSpacing = getNodeListRowSpacing();
  const rowGap = resolveNodeListRowGap(rowSpacing);
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

  return (
    <section
      aria-label="Topic list"
      className="flex flex-1 flex-col"
      data-node-list-row-gap={String(rowGap)}
      data-node-list-row-spacing={String(rowSpacing)}
      role="tree"
      style={{ gap: `${rowGap}px` }}
    >
      <VirtualListSurface
        autoScroll={false}
        estimateSize={() => 28 + rowSpacing * 2 + rowGap}
        getItemKey={(row) => row.node.id}
        items={rows}
        renderItem={(row, meta) =>
        renderWorkspaceTopicTreeRow(row, {
          activeNodeId,
          collapsedNodeIds,
          drag,
          nodesById,
          onContextMenu,
          onRenameNode,
          onRowKeyDown,
          onSelectNode,
          onToggleCollapse,
          meta,
          rowSpacing,
          selectedNodeIds
        })}
        scrollElementRef={scrollContainerRef}
        scrollToIndex={activeNodeId ? rows.findIndex((row) => row.node.id === activeNodeId) : null}
      />
    </section>
  );
}
