import { canNodeAcceptMovedNode, canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export type WorkspaceTopicTreeMoveIntent = 'before' | 'after' | 'child' | 'root';
export type WorkspaceTopicTreeDropOperation = 'folder-manual-order' | 'reject' | 'structural-move';

interface WorkspaceTopicTreeDropOperationArgs {
  activeFolderId: string;
  currentOrder: readonly string[];
  intent: WorkspaceTopicTreeMoveIntent;
  isManualSort: boolean;
  isVirtualFolderManualOrder: boolean;
  nodesById: WorkspaceListNodesById;
  sourceNodeIds: readonly string[];
  targetNodeId: string | null;
}

function isBeforeOrAfter(intent: WorkspaceTopicTreeMoveIntent) {
  return intent === 'before' || intent === 'after';
}

function canApplyVirtualManualOrder(args: WorkspaceTopicTreeDropOperationArgs) {
  if (!args.isManualSort || !isBeforeOrAfter(args.intent) || !args.targetNodeId) return false;
  const memberIds = new Set(args.currentOrder);
  return memberIds.has(args.targetNodeId) && args.sourceNodeIds.every((nodeId) => memberIds.has(nodeId));
}

function isFolderTopLevelSiblingEdge(args: WorkspaceTopicTreeDropOperationArgs) {
  return Boolean(
    args.targetNodeId &&
    isBeforeOrAfter(args.intent) &&
    args.nodesById[args.targetNodeId]?.parentNodeId === args.activeFolderId &&
    args.sourceNodeIds.every((nodeId) => args.nodesById[nodeId]?.parentNodeId === args.activeFolderId)
  );
}

function canApplyFolderManualOrder(args: WorkspaceTopicTreeDropOperationArgs) {
  return args.isManualSort;
}

function wouldCreateCycle(
  nextParentNodeId: string,
  sourceNodeIds: readonly string[],
  nodesById: WorkspaceListNodesById
) {
  const sourceIds = new Set(sourceNodeIds);
  const visited = new Set<string>();
  let currentNodeId: string | null = nextParentNodeId;
  while (currentNodeId && !visited.has(currentNodeId)) {
    if (sourceIds.has(currentNodeId)) return true;
    visited.add(currentNodeId);
    currentNodeId = nodesById[currentNodeId]?.parentNodeId ?? null;
  }
  return false;
}

function canApplyStructuralMove(args: WorkspaceTopicTreeDropOperationArgs) {
  const targetNode = args.targetNodeId ? args.nodesById[args.targetNodeId] : undefined;
  if (!targetNode || args.intent === 'root') return false;
  const nextParentNode = args.intent === 'child'
    ? targetNode
    : targetNode.parentNodeId
      ? args.nodesById[targetNode.parentNodeId]
      : undefined;
  if (!nextParentNode || wouldCreateCycle(nextParentNode.id, args.sourceNodeIds, args.nodesById)) return false;
  return args.sourceNodeIds.every((nodeId) => canNodeAcceptMovedNode(nextParentNode, args.nodesById[nodeId]));
}

export function resolveWorkspaceTopicTreeDropOperation(
  args: WorkspaceTopicTreeDropOperationArgs
): WorkspaceTopicTreeDropOperation {
  if (
    !args.targetNodeId ||
    args.sourceNodeIds.length === 0 ||
    args.sourceNodeIds.includes(args.targetNodeId) ||
    args.sourceNodeIds.some((nodeId) => !canNodeBeMoved(args.nodesById[nodeId]))
  ) return 'reject';
  if (args.isVirtualFolderManualOrder) {
    return canApplyVirtualManualOrder(args) ? 'folder-manual-order' : 'reject';
  }
  if (isFolderTopLevelSiblingEdge(args)) {
    return canApplyFolderManualOrder(args) ? 'folder-manual-order' : 'reject';
  }
  return canApplyStructuralMove(args) ? 'structural-move' : 'reject';
}
