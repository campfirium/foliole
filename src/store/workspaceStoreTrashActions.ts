import { removeImageClozeRegion } from '../features/image-cloze/model/imageCloze';

import { deleteEditorAnnotations } from './workspaceEditorAnnotationDelete';
import { findLiveImageClozeChildNodeIds } from './workspaceImageClozeRegionDeleteTargets';
import type { WorkspaceState } from './workspaceStore';
import { createDeleteNodesPermanentlyAction } from './workspaceStorePermanentDeleteAction';
import { createRestoreNodeAction } from './workspaceStoreRestoreAction';
import { createDeleteNodesAction } from './workspaceStoreStructureDeleteAction';
import type { TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

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

function createDeleteImageClozeRegionAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers,
  get?: () => WorkspaceState
): WorkspaceTrashActions['deleteImageClozeRegion'] {
  const read = get ?? (() => {
    let snapshot!: WorkspaceState;
    set(state => { snapshot = state; return state; });
    return snapshot;
  });
  return async (parentNodeId, attachmentId, regionId) => {
    const liveChildNodeIds = findLiveImageClozeChildNodeIds(read(), parentNodeId, attachmentId, regionId);
    if (liveChildNodeIds.length > 0) {
      await deleteEditorAnnotations(set, read, liveChildNodeIds, () => {}, { parentNodeId, attachmentId, regionId });
      return;
    }
    let updatedParentNode: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
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

    if (updatedParentNode) {
      runtimeHandlers.syncNodeContent(updatedParentNode);
    }
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
    deleteImageClozeRegion: createDeleteImageClozeRegionAction(set, runtimeHandlers, get),
    deleteNode: (nodeId) => deleteNodes([nodeId]),
    deleteNodes,
    restoreNode: createRestoreNodeAction(set, runtimeHandlers),
    deleteNodePermanently: (nodeId) => deleteNodesPermanently([nodeId]),
    deleteNodesPermanently
  };
}
