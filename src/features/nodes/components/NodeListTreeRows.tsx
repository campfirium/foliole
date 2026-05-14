import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

import { VirtualListSurface, type VirtualListRenderMeta } from '../../../shared/ui';
import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import { isInboxNode, isTrashNode, isVirtualRootNode } from '../model/specialNodes';
import {
  isFsrsWorkspaceListNode,
  type WorkspaceListNodesById
} from '../model/workspaceListNode';

import { getDismissedFadeOpacity, shouldFadeDismissedWholeRow } from './nodeIconAppearanceSettings';
import { NodeListStateSurface } from './NodeListStateSurface';
import type { useNodeListDragController } from './NodeListTreeDrag';
import { createNodeListRowKeydownHandler } from './NodeListTreeKeyboard';
import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from './NodeTreeRow';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState, type NodeTreeRowIconKind } from './NodeTreeRowIconModel';
import { TrashListRows, resolveNodeTreeRowVirtualSize } from './TrashListRows';

interface NodeListRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  drag: ReturnType<typeof useNodeListDragController>;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onRename: (nodeId: string, title: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  reviewSession: ReviewSessionState;
  rowSpacing: number;
  rows: NodeTreeRow[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
}

function renderNodeListRow(
  props: NodeListRowsProps,
  row: NodeTreeRow,
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void,
  meta?: VirtualListRenderMeta
) {
  const rowModel = resolveNodeListRowModel(props, row);

  return (
    <NodeTreeRowItem
      descendantCount={props.isTrashViewOpen ? 0 : row.descendantCount}
      depth={props.isTrashViewOpen ? 0 : row.depth}
      hasChildren={props.isTrashViewOpen ? false : row.hasChildren}
      isActive={(props.isTrashViewOpen ? props.selectedTrashNodeId : props.activeNodeId) === row.node.id}
      isBulkSelectionActive={props.selectedNodeIds.length > 1}
      isCollapsed={props.isTrashViewOpen ? false : props.collapsedNodeIds.has(row.node.id)}
      isDerived={rowModel.isDerivedNode}
      isDragDisabled={props.isTrashViewOpen || rowModel.isDerivedNode || rowModel.isInbox || rowModel.isTrashRoot || rowModel.isVirtualRoot}
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
      {...(props.onContextMenu ? { onContextMenu: props.onContextMenu } : {})}
      {...(props.drag.onDragEnd ? { onDragEnd: props.drag.onDragEnd } : {})}
      {...(props.drag.onDragEnterNode ? { onDragEnter: props.drag.onDragEnterNode } : {})}
      {...(props.drag.onDragOverNode ? { onDragOver: props.drag.onDragOverNode } : {})}
      {...(props.drag.onDragStartNode ? { onDragStart: props.drag.onDragStartNode } : {})}
      {...(props.drag.onDropOnNode ? { onDrop: props.drag.onDropOnNode } : {})}
      onKeyDown={onRowKeyDown}
      {...(!rowModel.isInbox && !rowModel.isTrashRoot && !rowModel.isVirtualRoot && props.onRename ? { onRename: props.onRename } : {})}
      onSelect={props.onSelect}
      onToggleCollapse={props.onToggleCollapse}
    />
  );
}

function resolveNodeListRowModel(props: NodeListRowsProps, row: NodeTreeRow) {
  const node = props.nodesById[row.node.id];
  const isInbox = isInboxNode(node);
  const isTrashRoot = isTrashNode(node);
  const isVirtualRoot = isVirtualRootNode(node);
  const isDerivedNode = Boolean(node?.anchorLink);
  const isReviewCard = isFsrsWorkspaceListNode(node);
  const nodeIconState = resolveNodeTreeRowIconState({
    isDismissed: node?.reading?.state === 'dismissed',
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

  return { isDerivedNode, isInbox, isTrashRoot, isVirtualRoot, leafIconKind, nodeIconKind, nodeIconState, shouldFadeWholeRow };
}

function resolveActiveRowIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  return activeNodeId ? rows.findIndex((row) => row.node.id === activeNodeId) : null;
}

function resolveLeafIconKind(kind: NodeTreeRowIconKind) {
  return kind === 'reading' || kind === 'review' ? kind : undefined;
}

export function NodeListRows(props: NodeListRowsProps) {
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
        className={props.isTrashViewOpen ? 'flex min-h-full items-center justify-center px-3 py-6' : undefined}
        emptyState={emptyState}
        hasRows={false}
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
      autoScroll={false}
      estimateSize={() => resolveNodeTreeRowVirtualSize(props.rowSpacing)}
      getItemKey={(row) => row.node.id}
      items={props.rows}
      renderItem={(row, meta) => renderNodeListRow(props, row, onRowKeyDown, meta)}
      scrollElementRef={props.scrollContainerRef}
      scrollToIndex={resolveActiveRowIndex(props.rows, props.activeNodeId)}
    />
  );
}
