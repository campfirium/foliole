import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import { resolveWorkspaceBrowseRootForTarget } from './workspaceBrowseRoot';
import type { WorkspaceState } from './workspaceStore';
import type { MoveNodesTransaction } from './workspaceStoreTreeActions';
import { createStructureMoveEntry, isWorkspaceStructureKind } from './workspaceStructureHistoryEntries';

function buildCommittedMovePatch(state: WorkspaceState, transaction: MoveNodesTransaction) {
  if (state.nodeOrder.join('\0') !== transaction.sourceNodeOrder.join('\0') ||
      Object.entries(transaction.sourceNodesById).some(([nodeId, node]) => state.nodesById[nodeId] !== node)) {
    return null;
  }
  const nodesById = { ...state.nodesById };
  Object.keys(transaction.sourceNodesById).forEach((nodeId) => {
    const nextNode = transaction.patch.nodesById[nodeId];
    if (nextNode) nodesById[nodeId] = nextNode;
  });
  const targetPatch = { nodeOrder: transaction.patch.nodeOrder, nodesById };
  if (!transaction.movedActiveTopic || !transaction.activeNodeIdAtRequest ||
      state.activeNodeId !== transaction.activeNodeIdAtRequest ||
      state.browseRootNodeId !== transaction.browseRootNodeIdAtRequest) return targetPatch;
  return {
    ...targetPatch,
    browseRootNodeId: resolveWorkspaceBrowseRootForTarget({
      browseRootNodeId: state.browseRootNodeId,
      intent: 'target-context',
      nodesById: transaction.patch.nodesById,
      targetNodeId: transaction.activeNodeIdAtRequest,
      trashedNodeIds: state.trashedNodeIds
    })
  };
}

export function commitMoveTransaction(state: WorkspaceState, transaction: MoveNodesTransaction) {
  const patch = buildCommittedMovePatch(state, transaction);
  if (!patch) return null;
  const firstRoot = state.nodesById[transaction.rootNodeIds[0] ?? ''];
  const entry = firstRoot && isWorkspaceStructureKind(firstRoot.kind)
    ? createStructureMoveEntry({
        after: { ...state, ...patch },
        before: state,
        movedNodeIds: transaction.movedNodeIds,
        rootNodeIds: transaction.rootNodeIds
      })
    : null;
  return {
    ...patch,
    ...(entry ? { appActionHistory: pushWorkspaceUndoEntry(state.appActionHistory, entry) } : {})
  };
}
