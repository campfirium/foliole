import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

import { AppEmptyState } from '../../../shared/ui';
import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import { isInboxNode, isTrashNode, isVirtualRootNode } from '../model/specialNodes';
import {
  isFsrsWorkspaceListNode,
  type WorkspaceListNodesById
} from '../model/workspaceListNode';

import { getDismissedFadeOpacity, shouldFadeDismissedWholeRow } from './nodeIconAppearanceSettings';
import type { useNodeListDragController } from './NodeListTreeDrag';
import { createNodeListRowKeydownHandler } from './NodeListTreeKeyboard';
import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from './NodeTreeRow';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState } from './NodeTreeRowIconModel';
import { TrashListRows } from './TrashListRows';

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
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
}

function renderNodeListRow(
  props: NodeListRowsProps,
  row: NodeTreeRow,
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void
) {
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
  const shouldFadeWholeRow = nodeIconState === 'dismissed' && shouldFadeDismissedWholeRow();

  return (
    <NodeTreeRowItem
      descendantCount={props.isTrashViewOpen ? 0 : row.descendantCount}
      depth={props.isTrashViewOpen ? 0 : row.depth}
      hasChildren={props.isTrashViewOpen ? false : row.hasChildren}
      isActive={(props.isTrashViewOpen ? props.selectedTrashNodeId : props.activeNodeId) === row.node.id}
      isCollapsed={props.isTrashViewOpen ? false : props.collapsedNodeIds.has(row.node.id)}
      isDerived={isDerivedNode}
      isDragDisabled={props.isTrashViewOpen || isDerivedNode || isInbox || isTrashRoot || isVirtualRoot}
      isDropTarget={props.drag.dropTargetNodeId === row.node.id}
      isMuted={shouldFadeWholeRow}
      mutedOpacity={shouldFadeWholeRow ? getDismissedFadeOpacity() : 1}
      dropIntent={props.drag.dropTargetNodeId === row.node.id ? props.drag.dropIntent : null}
      isSelected={props.selectedNodeIds.includes(row.node.id)}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      nodeIconKind={resolveNodeTreeRowIconKind({
        hasChildren: props.isTrashViewOpen ? false : row.hasChildren,
        isCollapsed: props.isTrashViewOpen ? false : props.collapsedNodeIds.has(row.node.id),
        isReviewCard,
        kind: node?.kind ?? 'topic'
      })}
      nodeIconState={nodeIconState}
      showIcon={false}
      rowSpacing={props.rowSpacing}
      onContextMenu={props.onContextMenu}
      onDragEnd={props.drag.onDragEnd}
      onDragEnter={props.drag.onDragEnterNode}
      onDragOver={props.drag.onDragOverNode}
      onDragStart={props.drag.onDragStartNode}
      onDrop={props.drag.onDropOnNode}
      onKeyDown={onRowKeyDown}
      onRename={isInbox || isTrashRoot || isVirtualRoot ? undefined : props.onRename}
      onSelect={props.onSelect}
      onToggleCollapse={props.onToggleCollapse}
    />
  );
}

export function NodeListRows(props: NodeListRowsProps) {
  if (props.rows.length === 0) {
    return props.isTrashViewOpen ? (
      <div className="flex min-h-full items-center justify-center px-3 py-6">
        <AppEmptyState description="Deleted topics will appear here." title="Trash is empty" />
      </div>
    ) : props.isVirtualViewOpen ? (
      <AppEmptyState description="Create a virtual folder to save a reusable filtered view." title="No virtual folders" />
    ) : (
      <AppEmptyState description="Create or import a topic to start editing." title="No topics" />
    );
  }

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
        selectedNodeIds={props.selectedNodeIds}
      />
    );
  }

  return props.rows.map((row) => renderNodeListRow(props, row, onRowKeyDown));
}
