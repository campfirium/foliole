import type { NativeMoveNodesResult } from '../../lib/platform/nativeMoveContract';

import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import { resolveWorkspaceBrowseRootForTarget } from './workspaceBrowseRoot';
import { mergeMoveResult } from './workspaceMoveCommit';
import type { WorkspaceState } from './workspaceStore';
import type { MoveNodesTransaction } from './workspaceStoreTreeActions';
import { createStructureMoveEntry, isWorkspaceStructureKind } from './workspaceStructureHistoryEntries';

function buildCommittedMovePatch(state: WorkspaceState, transaction: MoveNodesTransaction, result: NativeMoveNodesResult) {
  const targetPatch = mergeMoveResult(transaction.before, state, transaction.runtimePayload, result);
  if (!targetPatch) return null;
  if (!transaction.movedActiveTopic || !transaction.activeNodeIdAtRequest ||
      state.activeNodeId !== transaction.activeNodeIdAtRequest ||
      state.browseRootNodeId !== transaction.browseRootNodeIdAtRequest) return targetPatch;
  return {
    ...targetPatch,
    browseRootNodeId: resolveWorkspaceBrowseRootForTarget({
      browseRootNodeId: state.browseRootNodeId,
      intent: 'target-context',
      nodesById: targetPatch.nodesById,
      targetNodeId: transaction.activeNodeIdAtRequest,
      trashedNodeIds: state.trashedNodeIds
    })
  };
}

export function commitMoveTransaction(state: WorkspaceState, transaction: MoveNodesTransaction, result: NativeMoveNodesResult) {
  const patch = buildCommittedMovePatch(state, transaction, result);
  if (!patch) return null;
  const firstRoot = state.nodesById[transaction.rootNodeIds[0] ?? ''];
  const entry = firstRoot && isWorkspaceStructureKind(firstRoot.kind)
    ? createStructureMoveEntry({
        after: { ...state, ...patch },
        before: transaction.before,
        movedNodeIds: transaction.movedNodeIds,
        rootNodeIds: transaction.rootNodeIds
      })
    : null;
  return {
    ...patch,
    ...(entry ? { appActionHistory: pushWorkspaceUndoEntry(state.appActionHistory, entry) } : {})
  };
}
