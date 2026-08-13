import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { removeImageClozeRegion } from '../features/image-cloze/model/imageCloze';

import { createEditorAnnotationDeleteEntry } from './workspaceEditorAnnotationOperationEntry';
import { findLiveImageClozeChildNodeIds } from './workspaceImageClozeRegionDeleteTargets';
import type { WorkspaceState } from './workspaceStore';
import { createRestoreNodeAction } from './workspaceStoreRestoreAction';
import { createDeleteNodesAction } from './workspaceStoreStructureDeleteAction';
import { computeDeleteNodesMutation, computeDeleteNodesPermanentlyMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';
import { collectDeleteActionTargets } from './workspaceTrashMutationTargets';
import {
  commitPermanentDeleteMutation,
  commitSoftDeleteMutation,
  type TrashRuntimeHandlers
} from './workspaceTrashRuntimeCommit';

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

function createCommittedImageRegionDeletePatch(args: {
  deletedAt: string;
  deletedNodeIds: string[];
  mutation: DeleteNodeMutationResult;
  parentNodeId: string;
  state: WorkspaceState;
}) {
  const committedMutation = args.deletedNodeIds.every((nodeId) => args.mutation.nodeIds.includes(nodeId))
    ? args.mutation
    : computeDeleteNodesMutation(args.state, args.deletedNodeIds, args.deletedAt);
  if (!committedMutation) {
    return args.state;
  }
  const entry = createEditorAnnotationDeleteEntry(args.state, committedMutation.nodeIds, args.parentNodeId);
  return {
    ...committedMutation.patch,
    ...(entry ? { editorOperationHistory: pushEditorOperationEntry(args.state.editorOperationHistory, entry) } : {})
  };
}

function createDeleteImageClozeRegionAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers
): WorkspaceTrashActions['deleteImageClozeRegion'] {
  return async (parentNodeId, attachmentId, regionId) => {
    let mutation: DeleteNodeMutationResult | null = null;
    let updatedParentNode: WorkspaceState['nodesById'][string] | null = null;

    set((state) => {
      const liveChildNodeIds = findLiveImageClozeChildNodeIds(state, parentNodeId, attachmentId, regionId);
      if (liveChildNodeIds.length > 0) {
        mutation = computeDeleteNodesMutation(state, liveChildNodeIds);
        if (mutation) {
          mutation = reconcileExplicitImageRegionRemoval(mutation, parentNodeId, attachmentId, regionId);
        }
        return state;
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

    const pendingMutation = mutation as DeleteNodeMutationResult | null;
    if (pendingMutation) {
      const deletedAt = pendingMutation.deletedAt;
      const result = await commitSoftDeleteMutation(runtimeHandlers, pendingMutation);
      set((state) => {
        if (!pendingMutation || !result) {
          return state;
        }
        return createCommittedImageRegionDeletePatch({
          deletedAt,
          deletedNodeIds: result.deletedNodeIds,
          mutation: pendingMutation,
          parentNodeId,
          state
        });
      });
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
  return async (nodeIds) => {
    let mutation: DeleteNodeMutationResult | null = null;
    set((state) => {
      mutation = computeDeleteNodesPermanentlyMutation(state, collectDeleteActionTargets(state, nodeIds));
      return state;
    });
    const result = await commitPermanentDeleteMutation(runtimeHandlers, mutation);
    set((state) => {
      const committedNodeIds = result?.removedNodeIds ?? [];
      if (committedNodeIds.length === 0) {
        return state;
      }
      const committedMutation = computeDeleteNodesPermanentlyMutation(state, committedNodeIds);
      return committedMutation ? committedMutation.patch : state;
    });
  };
}

export function createWorkspaceTrashActions(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers,
  get?: () => WorkspaceState
): WorkspaceTrashActions {
  const deleteNodes = createDeleteNodesAction(set, runtimeHandlers, get);
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
