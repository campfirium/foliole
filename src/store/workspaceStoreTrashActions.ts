import { isImageClozeLocator, removeImageClozeRegion } from '../features/image-cloze/model/imageCloze';

import { createTopicDeleteHistoryPatch } from './workspaceDeleteActionHistory';
import type { WorkspaceState } from './workspaceStore';
import { createRestoreNodeAction, type RestoreNodeRuntimeHandlers } from './workspaceStoreRestoreAction';
import { computeDeleteNodesMutation, computeDeleteNodesPermanentlyMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';
import { collectDeleteActionTargets } from './workspaceTrashMutationTargets';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type WorkspaceTrashActions = Pick<
  WorkspaceState,
  | 'deleteImageClozeRegion'
  | 'deleteNode'
  | 'deleteNodes'
  | 'restoreNode'
  | 'deleteNodePermanently'
  | 'deleteNodesPermanently'
>;

interface TrashRuntimeHandlers {
  syncNodeContent: (node: WorkspaceState['nodesById'][string], position?: number) => void;
  syncSoftDeleteNodes: (payload: { nodeIds: string[]; deletedAt: string }) => void;
  syncRestoreNodes: RestoreNodeRuntimeHandlers['syncRestoreNodes'];
  syncDeleteNodesPermanently: (payload: { nodeIds: string[]; nodeOrder: string[] }) => void;
}

function findImageClozeRegionShape(
  state: WorkspaceState,
  parentNodeId: string,
  attachmentId: string,
  regionId: string
) {
  const parentNode = state.nodesById[parentNodeId];
  const group = parentNode?.imageRegions?.find((entry) => entry.attachmentId === attachmentId);
  return group?.regions.find((region) => region.id === regionId) ?? null;
}

function matchesImageClozeRegionShape(
  locator: { attachmentId: string; x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number } | null
) {
  return Boolean(
    region &&
      locator.x === region.x &&
      locator.y === region.y &&
      locator.width === region.width &&
      locator.height === region.height
  );
}

function findLiveImageClozeChildNodeIds(
  state: WorkspaceState,
  parentNodeId: string,
  attachmentId: string,
  regionId: string
) {
  const regionShape = findImageClozeRegionShape(state, parentNodeId, attachmentId, regionId);
  return Object.values(state.nodesById)
    .filter((node) => {
      if (node.parentNodeId !== parentNodeId || state.trashedNodeIds.includes(node.id)) {
        return false;
      }
      if (node.imageRegions?.some((group) => group.attachmentId === attachmentId && group.regions.some((region) => region.id === regionId))) {
        return true;
      }
      if (node.anchorLink?.kind !== 'cloze') {
        return false;
      }
      if (!isImageClozeLocator(node.anchorLink.locator) || node.anchorLink.locator.attachmentId !== attachmentId) {
        return false;
      }
      return node.anchorLink.id === regionId || matchesImageClozeRegionShape(node.anchorLink.locator, regionShape);
    })
    .map((node) => node.id);
}

function syncDeleteMutation(runtimeHandlers: TrashRuntimeHandlers, mutation: DeleteNodeMutationResult | null) {
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

function syncPermanentDeleteMutation(runtimeHandlers: TrashRuntimeHandlers, mutation: DeleteNodeMutationResult | null) {
  if (!mutation || mutation.nodeIds.length === 0 || !mutation.nodeOrder) {
    return;
  }
  for (const parentNode of mutation.parentNodesToSync) {
    runtimeHandlers.syncNodeContent(parentNode);
  }
  runtimeHandlers.syncDeleteNodesPermanently({
    nodeIds: mutation.nodeIds,
    nodeOrder: mutation.nodeOrder
  });
}

function createDeleteNodesAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers
): WorkspaceTrashActions['deleteNodes'] {
  return (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodesMutation(state, nodeIds);
      return mutation ? createTopicDeleteHistoryPatch(state, mutation) : state;
    });
    syncDeleteMutation(runtimeHandlers, mutation);
  };
}

function reconcileExplicitImageRegionRemoval(
  mutation: DeleteNodeMutationResult,
  parentNodeId: string,
  attachmentId: string,
  regionId: string
) {
  const parentNode = mutation.patch.nodesById[parentNodeId];
  if (!parentNode) {
    return mutation;
  }
  const nextImageRegions = removeImageClozeRegion(parentNode.imageRegions, attachmentId, regionId);
  if (nextImageRegions === parentNode.imageRegions) {
    return mutation;
  }
  const updatedParentNode = {
    ...parentNode,
    imageRegions: nextImageRegions,
    updatedAt: mutation.deletedAt
  };
  return {
    ...mutation,
    parentNodesToSync: [
      ...mutation.parentNodesToSync.filter((node) => node.id !== parentNodeId),
      updatedParentNode
    ],
    patch: {
      ...mutation.patch,
      nodesById: {
        ...mutation.patch.nodesById,
        [parentNodeId]: updatedParentNode
      }
    }
  };
}

function createDeleteImageClozeRegionAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers
): WorkspaceTrashActions['deleteImageClozeRegion'] {
  return (parentNodeId, attachmentId, regionId) => {
    let mutation: DeleteNodeMutationResult | null = null;
    let updatedParentNode: WorkspaceState['nodesById'][string] | null = null;

    set((state) => {
      const liveChildNodeIds = findLiveImageClozeChildNodeIds(state, parentNodeId, attachmentId, regionId);
      if (liveChildNodeIds.length > 0) {
        mutation = computeDeleteNodesMutation(state, liveChildNodeIds);
        if (mutation) {
          mutation = reconcileExplicitImageRegionRemoval(mutation, parentNodeId, attachmentId, regionId);
        }
        return mutation ? mutation.patch : state;
      }

      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }
      const nextImageRegions = removeImageClozeRegion(parentNode.imageRegions, attachmentId, regionId);
      if (nextImageRegions === parentNode.imageRegions) {
        return state;
      }
      updatedParentNode = {
        ...parentNode,
        imageRegions: nextImageRegions,
        updatedAt: new Date().toISOString()
      };
      return {
        nodesById: {
          ...state.nodesById,
          [parentNodeId]: updatedParentNode
        }
      };
    });

    if (mutation) {
      syncDeleteMutation(runtimeHandlers, mutation);
      return;
    }
    if (updatedParentNode) {
      runtimeHandlers.syncNodeContent(updatedParentNode);
    }
  };
}

function createDeleteNodesPermanentlyAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers
): WorkspaceTrashActions['deleteNodesPermanently'] {
  return (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodesPermanentlyMutation(state, collectDeleteActionTargets(state, nodeIds));
      return mutation ? mutation.patch : state;
    });
    syncPermanentDeleteMutation(runtimeHandlers, mutation);
  };
}

export function createWorkspaceTrashActions(set: WorkspaceSet, runtimeHandlers: TrashRuntimeHandlers): WorkspaceTrashActions {
  const deleteNodes = createDeleteNodesAction(set, runtimeHandlers);
  const deleteNodesPermanently = createDeleteNodesPermanentlyAction(set, runtimeHandlers);

  return {
    deleteImageClozeRegion: createDeleteImageClozeRegionAction(set, runtimeHandlers),
    deleteNode: (nodeId) => deleteNodes([nodeId]),
    deleteNodes,
    restoreNode: createRestoreNodeAction(set, runtimeHandlers),
    deleteNodePermanently: (nodeId) => deleteNodesPermanently([nodeId]),
    deleteNodesPermanently
  };
}
