import { collectNodeSubtreeIds } from './workspaceHelpers';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesMutation, computeDeleteNodesPermanentlyMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type WorkspaceTrashActions = Pick<
  WorkspaceState,
  'deleteNode' | 'deleteNodes' | 'restoreNode' | 'deleteNodePermanently' | 'deleteNodesPermanently'
>;

interface TrashRuntimeHandlers {
  syncNodeContent: DeleteNodeSyncHandlers['syncNodeContent'];
  syncSoftDeleteNodes: DeleteNodeSyncHandlers['syncSoftDeleteNodes'];
  syncRestoreNodes: (payload: { nodeIds: string[] }) => void;
  syncDeleteNodesPermanently: DeleteNodeSyncHandlers['syncDeleteNodesPermanently'];
}

interface DeleteNodeSyncHandlers {
  syncNodeContent: (node: WorkspaceState['nodesById'][string], position?: number) => void;
  syncSoftDeleteNodes: (payload: { nodeIds: string[]; deletedAt: string }) => void;
  syncDeleteNodesPermanently: (payload: { nodeIds: string[]; nodeOrder: string[] }) => void;
}

function syncDeleteMutation(runtimeHandlers: DeleteNodeSyncHandlers, mutation: DeleteNodeMutationResult | null) {
  if (!mutation || mutation.nodeIds.length === 0) {
    return;
  }
  for (const parentNode of mutation.parentNodesToSync) {
    runtimeHandlers.syncNodeContent(parentNode);
  }
  runtimeHandlers.syncSoftDeleteNodes({
    nodeIds: mutation.nodeIds,
    deletedAt: mutation.deletedAt
  });
}

function syncPermanentDeleteMutation(runtimeHandlers: DeleteNodeSyncHandlers, mutation: DeleteNodeMutationResult | null) {
  if (!mutation || mutation.nodeIds.length === 0 || !mutation.nodeOrder) {
    return;
  }
  runtimeHandlers.syncDeleteNodesPermanently({
    nodeIds: mutation.nodeIds,
    nodeOrder: mutation.nodeOrder
  });
}

function createDeleteNodesAction(
  set: WorkspaceSet,
  runtimeHandlers: DeleteNodeSyncHandlers
): WorkspaceTrashActions['deleteNodes'] {
  return (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodesMutation(state, nodeIds);
      return mutation ? mutation.patch : state;
    });
    syncDeleteMutation(runtimeHandlers, mutation);
  };
}

function createRestoreNodeAction(set: WorkspaceSet, runtimeHandlers: TrashRuntimeHandlers): WorkspaceTrashActions['restoreNode'] {
  return (nodeId) => {
    let idsToRestoreForSync: string[] = [];

    set((state) => {
      if (!state.nodesById[nodeId] || !state.trashedNodeIds.includes(nodeId)) {
        return state;
      }
      idsToRestoreForSync = collectNodeSubtreeIds(nodeId, state.nodesById);
      const idsToRestoreSet = new Set(idsToRestoreForSync);
      const nextTrashedNodeIds = state.trashedNodeIds.filter((id) => !idsToRestoreSet.has(id));
      const nextActiveNodeId = state.activeNodeId ?? nodeId;
      const nextState = {
        ...state,
        activeNodeId: nextActiveNodeId,
        trashedNodeIds: nextTrashedNodeIds
      };
      return {
        activeNodeId: nextActiveNodeId,
        reviewSession: reconcileReviewSession(nextState, nextActiveNodeId),
        trashedNodeIds: nextTrashedNodeIds
      };
    });

    if (idsToRestoreForSync.length === 0) {
      return;
    }
    runtimeHandlers.syncRestoreNodes({ nodeIds: idsToRestoreForSync });
  };
}

function createDeleteNodesPermanentlyAction(
  set: WorkspaceSet,
  runtimeHandlers: DeleteNodeSyncHandlers
): WorkspaceTrashActions['deleteNodesPermanently'] {
  return (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodesPermanentlyMutation(state, nodeIds);
      return mutation ? mutation.patch : state;
    });
    syncPermanentDeleteMutation(runtimeHandlers, mutation);
  };
}

export function createWorkspaceTrashActions(set: WorkspaceSet, runtimeHandlers: TrashRuntimeHandlers): WorkspaceTrashActions {
  const deleteNodes = createDeleteNodesAction(set, runtimeHandlers);
  const deleteNodesPermanently = createDeleteNodesPermanentlyAction(set, runtimeHandlers);

  return {
    deleteNode: (nodeId) => deleteNodes([nodeId]),
    deleteNodes,
    restoreNode: createRestoreNodeAction(set, runtimeHandlers),
    deleteNodePermanently: (nodeId) => deleteNodesPermanently([nodeId]),
    deleteNodesPermanently
  };
}
