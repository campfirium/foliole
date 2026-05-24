import { UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createRootNodeAction } from './workspaceRootNodeCreateAction';
import {
  syncCreateNodeToRuntime,
  syncDeleteNodesPermanentlyToRuntime,
  syncMoveNodesToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { type WorkspaceState } from './workspaceStore';
import { createUpdateNodeContentAction } from './workspaceStoreContentActions';
import {
  createHighlightFromSelectionAction,
  createQAFromSelectionAction
} from './workspaceStoreCreateActions';
import { createFormulaClozeNodeAction } from './workspaceStoreFormulaClozeActions';
import { createUpdateHighlightAnchorRangeAction } from './workspaceStoreHighlightRangeActions';
import { createImageClozeNodesAction } from './workspaceStoreImageClozeActions';
import { createDismissNodeAction } from './workspaceStoreNodeDismissAction';
import { createRelearnNodeAction } from './workspaceStoreNodeRelearnAction';
import {
  createUpdateNodeDesiredRetentionAction,
  createUpdateNodePriorityAction,
  createUpdateNodeShortTermAction
} from './workspaceStoreNodeSchedulerActions';
import { createSetNodeViewStateAction } from './workspaceStoreNodeViewActions';
import { createSetNodeSequentialReadingAction } from './workspaceStoreSequentialReadingActions';
import { createWorkspaceTrashActions } from './workspaceStoreTrashActions';
import {
  createChildNodeAction,
  createMoveNodeAction,
  createMoveNodesAction
} from './workspaceStoreTreeActions';
import { createVirtualNodeAction } from './workspaceStoreVirtualNodeActions';
import { createUpdateVirtualNodeFilterAction } from './workspaceStoreVirtualNodeFilterActions';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

type WorkspaceNodeActions = Pick<
  WorkspaceState,
  | 'createChildNode'
  | 'createFormulaClozeNode'
  | 'createHighlightNodeFromSelection'
  | 'createImageClozeNodes'
  | 'createQANodeFromSelection'
  | 'createRootNode'
  | 'createVirtualNode'
  | 'deleteImageClozeRegion'
  | 'deleteNode'
  | 'deleteNodes'
  | 'deleteNodePermanently'
  | 'deleteNodesPermanently'
  | 'dismissNode'
  | 'moveNode'
  | 'moveNodes'
  | 'restoreNode'
  | 'relearnNode'
  | 'setNodeSequentialReading'
  | 'setNodeViewState'
  | 'updateNodeDesiredRetention'
  | 'updateNodePriority'
  | 'updateNodeShortTerm'
  | 'updateNodeTitle'
  | 'updateNodeContent'
  | 'updateHighlightAnchorRange'
  | 'updateVirtualNodeFilter'
  | 'updateNodeReveal'
>;

function createUpdateNodeTitleAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeTitle'] {
  return (nodeId, title) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node)) {
        return state;
      }
      const nextTitle = title.trim() || UNTITLED_NODE_TITLE;
      const nextNode = {
        ...node,
        title: nextTitle,
        isTitleManual: true,
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
    });
    if (nextNodeForSync) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}

function createUpdateNodeRevealAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeReveal'] {
  return (nodeId, reveal) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node) || node.reveal === null) {
        return state;
      }
      const nextNode = {
        ...node,
        hasReveal: reveal !== null,
        reveal,
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
    });
    if (nextNodeForSync) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
      syncNodeRevealToRuntime(nextNodeForSync);
    }
  };
}

export function createWorkspaceNodeActions(set: WorkspaceSet): WorkspaceNodeActions {
  const trashActions = createWorkspaceTrashActions(set, {
    syncNodeContent: syncNodeContentToRuntime,
    syncSoftDeleteNodes: syncSoftDeleteNodesToRuntime,
    syncRestoreNodes: syncRestoreNodesToRuntime,
    syncDeleteNodesPermanently: syncDeleteNodesPermanentlyToRuntime
  });
  const runtimeHandlers = {
    syncNodeContent: syncNodeContentToRuntime,
    syncNodeCreation: syncCreateNodeToRuntime,
    syncNodeOrder: syncNodeOrderToRuntime
  };
  const syncMovedNodes = async (payload: Parameters<typeof syncMoveNodesToRuntime>[0]) =>
    Boolean(await syncMoveNodesToRuntime(payload));
  return {
    ...trashActions,
    setNodeViewState: createSetNodeViewStateAction(set),
    updateNodeTitle: createUpdateNodeTitleAction(set),
    updateNodeContent: createUpdateNodeContentAction(set),
    updateHighlightAnchorRange: createUpdateHighlightAnchorRangeAction(set),
    updateVirtualNodeFilter: createUpdateVirtualNodeFilterAction(set),
    updateNodeReveal: createUpdateNodeRevealAction(set),
    dismissNode: createDismissNodeAction(set),
    relearnNode: createRelearnNodeAction(set),
    updateNodePriority: createUpdateNodePriorityAction(set),
    updateNodeDesiredRetention: createUpdateNodeDesiredRetentionAction(set),
    updateNodeShortTerm: createUpdateNodeShortTermAction(set),
    setNodeSequentialReading: createSetNodeSequentialReadingAction(set),
    createRootNode: createRootNodeAction(set, runtimeHandlers),
    createChildNode: createChildNodeAction(set, syncCreateNodeToRuntime, syncNodeOrderToRuntime),
    createVirtualNode: createVirtualNodeAction(set, syncCreateNodeToRuntime, syncNodeOrderToRuntime),
    createHighlightNodeFromSelection: createHighlightFromSelectionAction(set, runtimeHandlers),
    createFormulaClozeNode: createFormulaClozeNodeAction(set, runtimeHandlers, reconcileReviewSession),
    createImageClozeNodes: createImageClozeNodesAction(set, runtimeHandlers, reconcileReviewSession),
    createQANodeFromSelection: createQAFromSelectionAction(set, runtimeHandlers),
    deleteImageClozeRegion: trashActions.deleteImageClozeRegion,
    moveNode: createMoveNodeAction(set, syncMovedNodes),
    moveNodes: createMoveNodesAction(set, syncMovedNodes)
  };
}
