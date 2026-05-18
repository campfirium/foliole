import {
  getDismissedFadeOpacity,
  shouldFadeDismissedWholeRow
} from '../../features/nodes/components/nodeIconAppearanceSettings';
import type { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState } from '../../features/nodes/components/NodeTreeRowIconModel';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isFsrsWorkspaceListNode } from '../../features/nodes/model/workspaceListNode';

export function resolveWorkspaceTopicTreeRowModel(
  row: NodeTreeRow,
  args: {
    collapsedNodeIds: ReadonlySet<string>;
    nodesById: WorkspaceListNodesById;
    selectedNodeIds: string[];
  }
) {
  const node = args.nodesById[row.node.id];
  const isSelected = args.selectedNodeIds.includes(row.node.id);
  const isDerivedNode = Boolean(node?.anchorLink);
  const isReviewCard = isFsrsWorkspaceListNode(node);
  const nodeIconState = resolveNodeTreeRowIconState({
    isDismissed: node?.reading?.state === 'dismissed',
    hasEnteredSchedule: isReviewCard
      ? node?.review?.lastReviewAt !== null && node?.review?.lastReviewAt !== undefined
      : (node?.reading?.repetitionCount ?? 0) > 0
  });
  const nodeIconKind = resolveNodeTreeRowIconKind({
    hasChildren: row.hasChildren,
    isCollapsed: args.collapsedNodeIds.has(row.node.id),
    isReviewCard,
    kind: node?.kind ?? 'topic'
  });
  const leafIconKind = nodeIconKind === 'reading' || nodeIconKind === 'review' ? nodeIconKind : undefined;
  const shouldFadeWholeRow = nodeIconState === 'dismissed' && shouldFadeDismissedWholeRow(leafIconKind);

  return {
    isDerivedNode,
    isSelected,
    mutedOpacity: shouldFadeWholeRow ? getDismissedFadeOpacity(leafIconKind) : 1,
    nodeIconKind,
    nodeIconState,
    shouldFadeWholeRow
  };
}

export function resolveWorkspaceTopicTreeRowDragProps(
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
