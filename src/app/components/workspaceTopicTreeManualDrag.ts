import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  resolveWorkspaceTopicTreeDropOperation,
  type WorkspaceTopicTreeMoveIntent
} from './workspaceTopicTreeDropOperation';

export function moveWorkspaceTopicTreeManualNodeIds(args: {
  currentOrder: readonly string[];
  sourceNodeIds: readonly string[];
  targetNodeId: string;
  intent: Extract<WorkspaceTopicTreeMoveIntent, 'before' | 'after'>;
}) {
  const sourceSet = new Set(args.sourceNodeIds);
  if (sourceSet.has(args.targetNodeId)) {
    return [...args.currentOrder];
  }
  const sourceNodeIds = args.currentOrder.filter((nodeId) => sourceSet.has(nodeId));
  const remainingNodeIds = args.currentOrder.filter((nodeId) => !sourceSet.has(nodeId));
  const targetIndex = remainingNodeIds.indexOf(args.targetNodeId);
  if (targetIndex < 0 || sourceNodeIds.length === 0) {
    return [...args.currentOrder];
  }
  const insertIndex = args.intent === 'after' ? targetIndex + 1 : targetIndex;
  return [
    ...remainingNodeIds.slice(0, insertIndex),
    ...sourceNodeIds,
    ...remainingNodeIds.slice(insertIndex)
  ];
}

export function createWorkspaceTopicTreeMove(args: {
  activeFolderId: string;
  currentOrder: readonly string[];
  isManualSort: boolean;
  isVirtualFolderManualOrder?: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: WorkspaceTopicTreeMoveIntent) => Promise<boolean>;
  nodesById: WorkspaceListNodesById;
  setFolderManualChildOrder?: (folderNodeId: string, manualChildOrder: string[]) => boolean;
}) {
  return async (nodeIds: string[], targetNodeId: string | null, intent: WorkspaceTopicTreeMoveIntent) => {
    const operation = resolveWorkspaceTopicTreeDropOperation({
      activeFolderId: args.activeFolderId,
      currentOrder: args.currentOrder,
      isVirtualFolderManualOrder: Boolean(args.isVirtualFolderManualOrder),
      sourceNodeIds: nodeIds,
      targetNodeId,
      intent,
      isManualSort: args.isManualSort,
      nodesById: args.nodesById
    });
    if (operation === 'structural-move') return args.moveNodes(nodeIds, targetNodeId, intent);
    if (operation === 'reject' || !targetNodeId) return false;
    return args.setFolderManualChildOrder?.(
      args.activeFolderId,
      moveWorkspaceTopicTreeManualNodeIds({
        currentOrder: args.currentOrder,
        sourceNodeIds: nodeIds,
        targetNodeId,
        intent: intent === 'after' ? 'after' : 'before'
      })
    ) ?? false;
  };
}
