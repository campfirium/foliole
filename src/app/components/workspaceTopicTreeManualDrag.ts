export type WorkspaceTopicTreeManualMoveIntent = 'before' | 'after' | 'child' | 'root';

function canApplyWorkspaceTopicTreeManualDrag(args: {
  activeFolderId: string;
  sourceNodeIds: readonly string[];
  targetNodeId: string | null;
  intent: WorkspaceTopicTreeManualMoveIntent;
  parentNodeIdById: Record<string, string | null | undefined>;
}) {
  if ((args.intent !== 'before' && args.intent !== 'after') || !args.targetNodeId) {
    return false;
  }
  if (args.parentNodeIdById[args.targetNodeId] !== args.activeFolderId) {
    return false;
  }
  return args.sourceNodeIds.every((nodeId) => args.parentNodeIdById[nodeId] === args.activeFolderId);
}

function canApplyWorkspaceTopicTreeStructuralDrag(args: {
  derivedNodeIds: ReadonlySet<string>;
  sourceNodeIds: readonly string[];
  targetNodeId: string | null;
  intent: WorkspaceTopicTreeManualMoveIntent;
}) {
  if (!args.targetNodeId || args.sourceNodeIds.some((nodeId) => args.derivedNodeIds.has(nodeId))) {
    return false;
  }
  return args.intent !== 'child' || !args.derivedNodeIds.has(args.targetNodeId);
}

export function moveWorkspaceTopicTreeManualNodeIds(args: {
  currentOrder: readonly string[];
  sourceNodeIds: readonly string[];
  targetNodeId: string;
  intent: Extract<WorkspaceTopicTreeManualMoveIntent, 'before' | 'after'>;
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

export function createWorkspaceTopicTreeManualMove(args: {
  activeFolderId: string;
  currentOrder: readonly string[];
  isManualSort: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: WorkspaceTopicTreeManualMoveIntent) => Promise<boolean>;
  parentNodeIdById: Record<string, string | null | undefined>;
  setFolderManualChildOrder?: (folderNodeId: string, manualChildOrder: string[]) => boolean;
  shouldAllowStructuralMove?: () => boolean;
  derivedNodeIds?: ReadonlySet<string>;
}) {
  return async (nodeIds: string[], targetNodeId: string | null, intent: WorkspaceTopicTreeManualMoveIntent) => {
    if (args.shouldAllowStructuralMove?.() && canApplyWorkspaceTopicTreeStructuralDrag({
      derivedNodeIds: args.derivedNodeIds ?? new Set<string>(),
      intent,
      sourceNodeIds: nodeIds,
      targetNodeId
    })) {
      return args.moveNodes(nodeIds, targetNodeId, intent);
    }
    if (!args.isManualSort) {
      return false;
    }
    if (!canApplyWorkspaceTopicTreeManualDrag({
      activeFolderId: args.activeFolderId,
      sourceNodeIds: nodeIds,
      targetNodeId,
      intent,
      parentNodeIdById: args.parentNodeIdById
    }) || !targetNodeId) {
      return false;
    }
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
