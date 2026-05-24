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
  syncRestoreNodes: (
    payload: { nodeIds: string[] }
  ) => Promise<WorkspaceRestoreNodesResult | undefined> | WorkspaceRestoreNodesResult | undefined;
}

export type RestoreNodeMutationEvent =
  | {
      kind: 'restore-nodes';
      nodeIds: string[];
      result: WorkspaceRestoreNodesResult;
      status: 'committed';
    }
  | {
      kind: 'restore-nodes';
      nodeIds: string[];
      reason: 'runtime-unavailable-or-failed';
      status: 'failed';
    };

interface RestoreNodeMutationCommit {
  event: Extract<RestoreNodeMutationEvent, { status: 'committed' }>;
  patch: Partial<WorkspaceState>;
  targetNodeId: string;
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

function createRestoreFailureEvent(nodeIds: string[]): RestoreNodeMutationEvent {
  return {
    kind: 'restore-nodes',
    nodeIds,
    reason: 'runtime-unavailable-or-failed',
    status: 'failed'
  };
}

function createRestoreCommit(
  state: WorkspaceState,
  result: WorkspaceRestoreNodesResult,
  rootNodeId: string,
  nodeIds: string[]
): RestoreNodeMutationCommit {
  const targetNodeId = resolveRestoreTargetNodeId(rootNodeId, result);
  return {
    event: {
      kind: 'restore-nodes',
      nodeIds,
      result,
      status: 'committed'
    },
    patch: applyRestoreResult(state, result, targetNodeId),
    targetNodeId
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

    const restoreRootNodeId = rootNodeId;
    const restoreResult = await runtimeHandlers.syncRestoreNodes({ nodeIds: idsToRestoreForSync });
    if (!restoreResult) {
      void createRestoreFailureEvent(idsToRestoreForSync);
      return null;
    }
    let targetNodeId: string | null = null;
    set((state) => {
      const commit = createRestoreCommit(state, restoreResult, restoreRootNodeId, idsToRestoreForSync);
      targetNodeId = commit.targetNodeId;
      return commit.patch;
    });
    return targetNodeId;
  };
}
