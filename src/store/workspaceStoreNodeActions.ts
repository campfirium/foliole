import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createRootNodeAction } from './workspaceRootNodeCreateAction';
import {
  syncCreateNodeToRuntime,
  syncCreateNodeMutationToRuntime,
  syncDeleteNodesPermanentlyToRuntime,
  syncMoveNodesToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  hasWorkspaceNodeMutationRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { type WorkspaceState } from './workspaceStore';
import { createUpdateNodeContentAction } from './workspaceStoreContentActions';
import {
  createHighlightFromSelectionAction,
  createQAFromSelectionAction
} from './workspaceStoreCreateActions';
import { createChildNodeAction } from './workspaceStoreCreateChildNodeAction';
import { createFormulaClozeNodeAction } from './workspaceStoreFormulaClozeActions';
import { createUpdateHighlightAnchorRangeAction } from './workspaceStoreHighlightRangeActions';
import { createImageClozeNodesAction } from './workspaceStoreImageClozeActions';
import { createSetFolderManualChildOrderAction } from './workspaceStoreManualChildOrderActions';
import { createDismissNodeAction } from './workspaceStoreNodeDismissAction';
import {
  createUpdateNodeDerivedTitleAction,
  createUpdateNodeRevealAction,
  createUpdateNodeTitleAction
} from './workspaceStoreNodeEditActions';
import { createRelearnNodeAction } from './workspaceStoreNodeRelearnAction';
import {
  createUpdateNodeDesiredRetentionAction,
  createUpdateNodePriorityAction,
  createUpdateNodeShortTermAction
} from './workspaceStoreNodeSchedulerActions';
import { createShelveNodeAction, createUnshelveNodeAction } from './workspaceStoreNodeShelveAction';
import { createSetNodeViewStateAction } from './workspaceStoreNodeViewActions';
import { createSetNodeSequentialReadingAction } from './workspaceStoreSequentialReadingActions';
import { createWorkspaceTrashActions } from './workspaceStoreTrashActions';
import {
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
  | 'setFolderManualChildOrder'
  | 'shelveNode'
  | 'unshelveNode'
  | 'setNodeViewState'
  | 'updateNodeDesiredRetention'
  | 'updateNodePriority'
  | 'updateNodeShortTerm'
  | 'updateNodeTitle'
  | 'updateNodeDerivedTitle'
  | 'updateNodeContent'
  | 'updateHighlightAnchorRange'
  | 'updateVirtualNodeFilter'
  | 'updateNodeReveal'
>;

function createRuntimeHandlers() {
  return {
    hasMutationRuntime: hasWorkspaceNodeMutationRuntime,
    syncNodeContent: syncNodeContentToRuntime,
    syncNodeCreation: async (
      node: WorkspaceState['nodesById'][string],
      nodeOrder?: string[],
      activeNodeId?: string | null,
      position?: number
    ) => {
      if (!nodeOrder) {
        syncCreateNodeToRuntime(node);
        return null;
      }
      return syncCreateNodeMutationToRuntime(node, nodeOrder, activeNodeId, position);
    },
    syncNodeOrder: syncNodeOrderToRuntime
  };
}

export function createWorkspaceNodeActions(set: WorkspaceSet): WorkspaceNodeActions {
  const trashActions = createWorkspaceTrashActions(set, {
    syncNodeContent: syncNodeContentToRuntime,
    syncSoftDeleteNodes: syncSoftDeleteNodesToRuntime,
    syncRestoreNodes: syncRestoreNodesToRuntime,
    syncDeleteNodesPermanently: syncDeleteNodesPermanentlyToRuntime
  });
  const runtimeHandlers = createRuntimeHandlers();
  const syncMovedNodes = async (payload: Parameters<typeof syncMoveNodesToRuntime>[0]) =>
    Boolean(await syncMoveNodesToRuntime(payload));
  return {
    ...trashActions,
    setNodeViewState: createSetNodeViewStateAction(set),
    updateNodeTitle: createUpdateNodeTitleAction(set),
    updateNodeDerivedTitle: createUpdateNodeDerivedTitleAction(set),
    updateNodeContent: createUpdateNodeContentAction(set),
    updateHighlightAnchorRange: createUpdateHighlightAnchorRangeAction(set),
    updateVirtualNodeFilter: createUpdateVirtualNodeFilterAction(set),
    updateNodeReveal: createUpdateNodeRevealAction(set),
    dismissNode: createDismissNodeAction(set),
    shelveNode: createShelveNodeAction(set),
    unshelveNode: createUnshelveNodeAction(set),
    relearnNode: createRelearnNodeAction(set),
    updateNodePriority: createUpdateNodePriorityAction(set),
    updateNodeDesiredRetention: createUpdateNodeDesiredRetentionAction(set),
    updateNodeShortTerm: createUpdateNodeShortTermAction(set),
    setNodeSequentialReading: createSetNodeSequentialReadingAction(set),
    setFolderManualChildOrder: createSetFolderManualChildOrderAction(set),
    createRootNode: createRootNodeAction(set, runtimeHandlers),
    createChildNode: createChildNodeAction(
      set,
      runtimeHandlers.syncNodeCreation,
      syncNodeOrderToRuntime,
      hasWorkspaceNodeMutationRuntime
    ),
    createVirtualNode: createVirtualNodeAction(
      set,
      runtimeHandlers.syncNodeCreation,
      syncNodeOrderToRuntime,
      hasWorkspaceNodeMutationRuntime
    ),
    createHighlightNodeFromSelection: createHighlightFromSelectionAction(set, runtimeHandlers),
    createFormulaClozeNode: createFormulaClozeNodeAction(set, runtimeHandlers, reconcileReviewSession),
    createImageClozeNodes: createImageClozeNodesAction(set, runtimeHandlers, reconcileReviewSession),
    createQANodeFromSelection: createQAFromSelectionAction(set, runtimeHandlers),
    deleteImageClozeRegion: trashActions.deleteImageClozeRegion,
    moveNode: createMoveNodeAction(set, syncMovedNodes),
    moveNodes: createMoveNodesAction(set, syncMovedNodes)
  };
}
