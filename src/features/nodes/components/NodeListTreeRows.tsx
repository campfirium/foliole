import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

import { VirtualListSurface, type VirtualListRenderMeta } from '../../../shared/ui';
import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import { isHomeNode, isInboxNode, isTrashNode, isVirtualRootNode } from '../model/specialNodes';
import {
  isFsrsWorkspaceListNode,
  isVisuallyInactiveWorkspaceListReadingTopic,
  type WorkspaceListNodesById
} from '../model/workspaceListNode';

import { getDismissedFadeOpacity, shouldFadeDismissedWholeRow } from './nodeIconAppearanceSettings';
import { resolveNodeListRowGap, resolveNodeTreeRowVirtualSize } from './nodeListRowSpacingSettings';
import { NodeListStateSurface } from './NodeListStateSurface';
import type { useNodeListDragController } from './NodeListTreeDrag';
import { createNodeListRowKeydownHandler } from './NodeListTreeKeyboard';
import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from './NodeTreeRow';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState, type NodeTreeRowIconKind } from './NodeTreeRowIconModel';
import { TrashListRows } from './TrashListRows';

interface NodeListRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  drag: ReturnType<typeof useNodeListDragController>;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  highlightedNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onExpandCollapse: (nodeId: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onRename: (nodeId: string, title: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  reviewSession: ReviewSessionState;
  rowCountByNodeId?: ReadonlyMap<string, number> | undefined;
  rowSpacing: number;
  rows: NodeTreeRow[];
  scrollTargetNodeId: string | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  virtualizeRows: boolean;
}

function renderNodeListRow(
  props: NodeListRowsProps,
  row: NodeTreeRow,
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void,
  meta?: VirtualListRenderMeta
) {
  const rowModel = resolveNodeListRowModel(props, row);
  const onSelect = createNodeListRowSelectHandler(props, row);
  const onDragOver = (nodeId: string, event: Parameters<typeof props.drag.onDragOverNode>[1]) => {
    props.drag.onDragOverNode(nodeId, event);
    if (shouldExpandFolderOnDragOver(row, props.collapsedNodeIds)) {
      props.onExpandCollapse(nodeId);
    }
  };

  return (
    <NodeTreeRowItem
      descendantCount={resolveNodeListRowCount(props, row)}
      depth={props.isTrashViewOpen ? 0 : row.depth}
      hasChildren={props.isTrashViewOpen ? false : row.hasChildren}
      isActive={(props.isTrashViewOpen ? props.selectedTrashNodeId : props.activeNodeId) === row.node.id}
      isBulkSelectionActive={props.selectedNodeIds.length > 1}
      isCollapsed={props.isTrashViewOpen || rowModel.isHome ? false : props.collapsedNodeIds.has(row.node.id)}
      isDerived={rowModel.isDerivedNode}
      isHighlighted={!props.isTrashViewOpen && props.highlightedNodeId === row.node.id}
      isDragDisabled={props.isTrashViewOpen || rowModel.isDerivedNode || rowModel.isHome || rowModel.isInbox || rowModel.isTrashRoot || rowModel.isVirtualRoot}
      isDropTarget={props.drag.dropTargetNodeId === row.node.id}
      isMuted={rowModel.shouldFadeWholeRow}
      mutedOpacity={rowModel.shouldFadeWholeRow ? getDismissedFadeOpacity(rowModel.leafIconKind) : 1}
      dropIntent={props.drag.dropTargetNodeId === row.node.id ? props.drag.dropIntent : null}
      isSelected={props.selectedNodeIds.includes(row.node.id)}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      {...(meta ? { ariaPosInSet: meta.ariaPosInSet, ariaSetSize: meta.ariaSetSize } : {})}
      nodeIconKind={rowModel.nodeIconKind}
      nodeIconState={rowModel.nodeIconState}
      showIcon={false}
      rowSpacing={props.rowSpacing}
      onContextMenu={props.onContextMenu}
      onDragEnd={props.drag.onDragEnd}
      onDragEnter={props.drag.onDragEnterNode}
      onDragLeave={props.drag.onDragLeaveNode}
      onDragOver={onDragOver}
      onDragStart={props.drag.onDragStartNode}
      onDrop={props.drag.onDropOnNode}
      onKeyDown={onRowKeyDown}
      {...(!rowModel.isHome && !rowModel.isInbox && !rowModel.isTrashRoot && !rowModel.isVirtualRoot ? { onRename: props.onRename } : {})}
      onSelect={onSelect}
      onToggleCollapse={props.onToggleCollapse}
    />
  );
}

function createNodeListRowSelectHandler(props: NodeListRowsProps, row: NodeTreeRow) {
  return (nodeId: string, modifiers?: NodeSelectModifiers) => {
    props.onSelect(nodeId, modifiers);
    if (shouldExpandFolderOnSelect(row, nodeId, props.collapsedNodeIds, modifiers)) {
      props.onToggleCollapse(nodeId);
    }
  };
}

function shouldExpandFolderOnSelect(
  row: NodeTreeRow,
  nodeId: string,
  collapsedNodeIds: ReadonlySet<string>,
  modifiers?: NodeSelectModifiers
) {
  return !modifiers?.ctrlKey && !modifiers?.metaKey && !modifiers?.shiftKey && shouldExpandFolder(row, nodeId, collapsedNodeIds);
}

function shouldExpandFolderOnDragOver(row: NodeTreeRow, collapsedNodeIds: ReadonlySet<string>) {
  return shouldExpandFolder(row, row.node.id, collapsedNodeIds);
}

function shouldExpandFolder(row: NodeTreeRow, nodeId: string, collapsedNodeIds: ReadonlySet<string>) {
  return !isHomeNode(row.node) && row.hasChildren && row.node.kind === 'folder' && collapsedNodeIds.has(nodeId);
}

function resolveNodeListRowCount(props: NodeListRowsProps, row: NodeTreeRow) {
  return props.isTrashViewOpen ? 0 : (props.rowCountByNodeId?.get(row.node.id) ?? row.descendantCount);
}

function resolveNodeListRowModel(props: NodeListRowsProps, row: NodeTreeRow) {
  const node = props.nodesById[row.node.id];
  const isHome = isHomeNode(node);
  const isInbox = isInboxNode(node);
  const isTrashRoot = isTrashNode(node);
  const isVirtualRoot = isVirtualRootNode(node);
  const isDerivedNode = Boolean(node?.anchorLink);
  const isReviewCard = isFsrsWorkspaceListNode(node);
  const isInactiveReadingTopic = isVisuallyInactiveWorkspaceListReadingTopic(node, props.nodesById);
  const nodeIconState = resolveNodeTreeRowIconState({
    isDismissed: isInactiveReadingTopic,
    hasEnteredSchedule: isReviewCard
      ? node?.review?.lastReviewAt !== null && node?.review?.lastReviewAt !== undefined
      : (node?.reading?.repetitionCount ?? 0) > 0
  });
  const nodeIconKind = resolveNodeTreeRowIconKind({
    hasChildren: props.isTrashViewOpen ? false : row.hasChildren,
    isCollapsed: props.isTrashViewOpen ? false : props.collapsedNodeIds.has(row.node.id),
    isReviewCard,
    kind: node?.kind ?? 'topic'
  });
  const leafIconKind = resolveLeafIconKind(nodeIconKind);
  const shouldFadeWholeRow = nodeIconState === 'dismissed' && shouldFadeDismissedWholeRow(leafIconKind);

  return { isDerivedNode, isHome, isInbox, isTrashRoot, isVirtualRoot, leafIconKind, nodeIconKind, nodeIconState, shouldFadeWholeRow };
}

function resolveActiveRowIndex(rows: readonly NodeTreeRow[], nodeId: string | null) {
  return nodeId ? rows.findIndex((row) => row.node.id === nodeId) : null;
}

function resolveLeafIconKind(kind: NodeTreeRowIconKind) {
  return kind === 'reading' || kind === 'review' ? kind : undefined;
}

export function NodeListRows(props: NodeListRowsProps) {
  const rowGap = resolveNodeListRowGap(props.rowSpacing);
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: props.collapsedNodeIds,
        onSelect: (nodeId) => props.onSelect(nodeId),
        onToggleCollapse: props.onToggleCollapse,
        rows: props.rows
      }),
    [props.collapsedNodeIds, props.onSelect, props.onToggleCollapse, props.rows]
  );

  if (props.rows.length === 0) {
    const emptyState = props.isTrashViewOpen
      ? { description: 'Deleted topics will appear here.', title: 'Trash is empty' }
      : props.isVirtualViewOpen
        ? { description: 'Create a virtual folder to save a reusable filtered view.', title: 'No virtual folders' }
        : { description: 'Create or import a topic to start editing.', title: 'No topics' };
    return (
      <NodeListStateSurface
        emptyState={emptyState}
        hasRows={false}
        {...(props.isTrashViewOpen
          ? { className: 'flex min-h-full items-center justify-center px-3 py-6' }
          : {})}
      >
        {null}
      </NodeListStateSurface>
    );
  }

  if (props.isTrashViewOpen) {
    return (
      <TrashListRows
        activeNodeId={props.selectedTrashNodeId}
        nodesById={props.nodesById}
        onContextMenu={props.onContextMenu}
        onKeyDown={onRowKeyDown}
        onSelect={props.onSelect}
        rows={props.rows}
        rowSpacing={props.rowSpacing}
        scrollContainerRef={props.scrollContainerRef}
        selectedNodeIds={props.selectedNodeIds}
      />
    );
  }

  return (
    <VirtualListSurface
      autoScroll={props.virtualizeRows}
      enabled={props.virtualizeRows}
      estimateSize={(index) => resolveNodeTreeRowVirtualSize(props.rowSpacing, index === props.rows.length - 1 ? 0 : rowGap)}
      getItemKey={(row) => row.node.id}
      items={props.rows}
      renderItem={(row, meta) => renderNodeListRow(props, row, onRowKeyDown, meta)}
      scrollElementRef={props.scrollContainerRef}
      scrollToIndex={resolveActiveRowIndex(props.rows, props.scrollTargetNodeId ?? props.activeNodeId)}
    />
  );
}
