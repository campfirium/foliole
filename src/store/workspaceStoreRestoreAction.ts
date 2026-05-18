import type { WorkspaceRestoreNodesResult } from '../shared/platform/workspaceRuntimeTypes';

import { collectNodeSubtreeIds } from './workspaceHelpers';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { collectTrashRootActionTargets } from './workspaceTrashMutationTargets';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export interface RestoreNodeRuntimeHandlers {
  syncRestoreNodes: (payload: { nodeIds: string[] }) => Promise<WorkspaceRestoreNodesResult> | WorkspaceRestoreNodesResult | undefined;
}

function resolveRestoreTargetNodeId(rootNodeId: string, result: WorkspaceRestoreNodesResult) {
  return result.skippedConflicts[0]?.liveNodeId ?? rootNodeId;
}

function applyRestoreResult(
  state: WorkspaceState,
  result: WorkspaceRestoreNodesResult,
  targetNodeId: string
): Partial<WorkspaceState> {
  const restoredNodeIds = new Set(result.restoredNodeIds);
  const nextTrashedNodeIds = state.trashedNodeIds.filter((id) => !restoredNodeIds.has(id));
  const nextTrashedNodeDeletedAtById = { ...state.trashedNodeDeletedAtById };
  result.restoredNodeIds.forEach((id) => {
    delete nextTrashedNodeDeletedAtById[id];
  });
  const nextState = {
    ...state,
    activeNodeId: targetNodeId,
    trashedNodeDeletedAtById: nextTrashedNodeDeletedAtById,
    trashedNodeIds: nextTrashedNodeIds
  };
  return {
    activeNodeId: targetNodeId,
    reviewSession: reconcileReviewSession(nextState, targetNodeId),
    trashedNodeDeletedAtById: nextTrashedNodeDeletedAtById,
    trashedNodeIds: nextTrashedNodeIds
  };
}

export function createRestoreNodeAction(
  set: WorkspaceSet,
  runtimeHandlers: RestoreNodeRuntimeHandlers
): WorkspaceState['restoreNode'] {
  return async (nodeId) => {
    let idsToRestoreForSync: string[] = [];
    let rootNodeId: string | null = null;

    set((state) => {
      rootNodeId = collectTrashRootActionTargets(state, [nodeId])[0] ?? null;
      idsToRestoreForSync = rootNodeId ? collectNodeSubtreeIds(rootNodeId, state.nodesById) : [];
      return state;
    });

    if (!rootNodeId || idsToRestoreForSync.length === 0) {
      return null;
    }

    const restoreResult = await runtimeHandlers.syncRestoreNodes({ nodeIds: idsToRestoreForSync }) ?? {
      restoredNodeIds: idsToRestoreForSync,
      skippedConflicts: []
    };
    const targetNodeId = resolveRestoreTargetNodeId(rootNodeId, restoreResult);
    set((state) => applyRestoreResult(state, restoreResult, targetNodeId));
    return targetNodeId;
  };
}
