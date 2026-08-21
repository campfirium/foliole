import {
  getDismissedFadeTextOpacity,
  shouldFadeDismissedRowText
} from '../../features/nodes/components/nodeIconAppearanceSettings';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState } from '../../features/nodes/components/NodeTreeRowIconModel';
import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isFsrsWorkspaceListNode, isVisuallyInactiveWorkspaceListReadingTopic } from '../../features/nodes/model/workspaceListNode';

import type { WorkspaceTopicTreeDragController } from './workspaceTopicTreeDrag';

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
  const isInactiveReadingTopic = isVisuallyInactiveWorkspaceListReadingTopic(node, args.nodesById);
  const nodeIconState = resolveNodeTreeRowIconState({
    isDismissed: isInactiveReadingTopic,
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
  const shouldFadeRowText = nodeIconState === 'dismissed' && shouldFadeDismissedRowText(leafIconKind);

  return {
    isDerivedNode,
    isDragDisabled: !canNodeBeMoved(node),
    isSelected,
    mutedOpacity: shouldFadeRowText ? getDismissedFadeTextOpacity(leafIconKind) : 1,
    nodeIconKind,
    nodeIconState,
    shouldFadeWholeRow: shouldFadeRowText
  };
}

export function resolveWorkspaceTopicTreeRowDragProps(
  nodeId: string,
  isDragDisabled: boolean,
  isManualSort: boolean,
  isFolderNode: boolean,
  drag: WorkspaceTopicTreeDragController
) {
  const dropIntent = resolveWorkspaceTopicTreeRowDropIntent({
    drag,
    isFolderNode,
    isManualSort,
    nodeId
  });
  return {
    dropIntent,
    isDragDisabled,
    isDropTarget: dropIntent !== null,
    onDragEnd: drag.onDragEnd,
    onDragEnter: drag.onDragEnterNode,
    onDragLeave: drag.onDragLeaveNode,
    onDragOver: drag.onDragOverNode,
    onDragStart: drag.onDragStartNode,
    onDrop: drag.onDropOnNode
  };
}

function resolveWorkspaceTopicTreeRowDropIntent(args: {
  drag: WorkspaceTopicTreeDragController;
  isFolderNode: boolean;
  isManualSort: boolean;
  nodeId: string;
}) {
  if (args.drag.dropTargetNodeId !== args.nodeId) {
    return null;
  }
  if (args.isFolderNode) {
    return args.drag.dropIntent;
  }
  if (args.drag.isStructuralDragActive) {
    return args.drag.dropIntent;
  }
  if (!args.isManualSort || args.drag.dropIntent === 'child') {
    return null;
  }
  return args.drag.dropIntent;
}
