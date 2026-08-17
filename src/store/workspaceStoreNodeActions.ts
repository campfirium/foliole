import type { WorkspaceMoveNodesPayload } from '../shared/platform/workspaceRuntimeTypes';

import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createRootNodeAction } from './workspaceRootNodeCreateAction';
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
import { createMoveNodeAction } from './workspaceStoreMoveNodeAction';
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
    syncNodeContent: (node: WorkspaceState['nodesById'][string], position?: number) =>
      getWorkspaceMutationRepository().syncNodeContent(node, position),
    syncNodeCreation: async (
      node: WorkspaceState['nodesById'][string],
      nodeOrder?: string[],
      activeNodeId?: string | null,
      position?: number
    ) => getWorkspaceMutationRepository().syncNodeCreation(node, nodeOrder, activeNodeId, position),
    syncNodeOrder: (nodeOrder: string[]) => getWorkspaceMutationRepository().syncNodeOrder(nodeOrder)
  };
}

export function createWorkspaceNodeActions(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceNodeActions {
  const trashActions = createWorkspaceTrashActions(set, {
    syncNodeContent: (node, position) => getWorkspaceMutationRepository().syncNodeContent(node, position),
    syncSoftDeleteNodes: (payload) => getWorkspaceMutationRepository().syncSoftDeleteNodes(payload),
    syncRestoreNodes: (payload) => getWorkspaceMutationRepository().syncRestoreNodes(payload),
    syncDeleteNodesPermanently: (payload) =>
      getWorkspaceMutationRepository().syncDeleteNodesPermanently(payload)
  }, get);
  const runtimeHandlers = createRuntimeHandlers();
  const syncMovedNodes = (payload: WorkspaceMoveNodesPayload) =>
    getWorkspaceMutationRepository().syncMoveNodes(payload);
  return {
    ...trashActions,
    setNodeViewState: createSetNodeViewStateAction(set),
    updateNodeTitle: createUpdateNodeTitleAction(set),
    updateNodeDerivedTitle: createUpdateNodeDerivedTitleAction(set),
    updateNodeContent: createUpdateNodeContentAction(set),
    updateHighlightAnchorRange: createUpdateHighlightAnchorRangeAction(set),
    updateVirtualNodeFilter: createUpdateVirtualNodeFilterAction(set),
    updateNodeReveal: createUpdateNodeRevealAction(set),
    dismissNode: createDismissNodeAction(set, get),
    shelveNode: createShelveNodeAction(set, get),
    unshelveNode: createUnshelveNodeAction(set, get),
    relearnNode: createRelearnNodeAction(set),
    updateNodePriority: createUpdateNodePriorityAction(set),
    updateNodeDesiredRetention: createUpdateNodeDesiredRetentionAction(set),
    updateNodeShortTerm: createUpdateNodeShortTermAction(set),
    setNodeSequentialReading: createSetNodeSequentialReadingAction(set),
    setFolderManualChildOrder: createSetFolderManualChildOrderAction(set),
    createRootNode: createRootNodeAction(set, runtimeHandlers, get),
    createChildNode: createChildNodeAction(
      set,
      runtimeHandlers.syncNodeCreation,
      runtimeHandlers.syncNodeOrder,
      get
    ),
    createVirtualNode: createVirtualNodeAction(
      set,
      runtimeHandlers.syncNodeCreation,
      runtimeHandlers.syncNodeOrder,
      get
    ),
    createHighlightNodeFromSelection: createHighlightFromSelectionAction(set, runtimeHandlers, get),
    createFormulaClozeNode: createFormulaClozeNodeAction(set, runtimeHandlers, reconcileReviewSession, get),
    createImageClozeNodes: createImageClozeNodesAction(set, runtimeHandlers, reconcileReviewSession, get),
    createQANodeFromSelection: createQAFromSelectionAction(set, runtimeHandlers, get),
    deleteImageClozeRegion: trashActions.deleteImageClozeRegion,
    moveNode: createMoveNodeAction(set, syncMovedNodes),
    moveNodes: createMoveNodesAction(set, syncMovedNodes)
  };
}
