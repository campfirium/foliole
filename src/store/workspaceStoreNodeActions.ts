import { UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';
import { hasNodeContent } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import {
  syncCreateNodeToRuntime,
  syncDeleteNodesPermanentlyToRuntime,
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
  createQAFromSelectionAction,
  createRootNodeAction
} from './workspaceStoreCreateActions';
import { createUpdateHighlightAnchorRangeAction } from './workspaceStoreHighlightRangeActions';
import { createImageClozeNodesAction } from './workspaceStoreImageClozeActions';
import { createRelearnNodeAction } from './workspaceStoreNodeRelearnAction';
import {
  createUpdateNodeDesiredRetentionAction,
  createUpdateNodePriorityAction
} from './workspaceStoreNodeSchedulerActions';
import { createSetNodeViewStateAction } from './workspaceStoreNodeViewActions';
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
  | 'setNodeViewState'
  | 'updateNodeDesiredRetention'
  | 'updateNodePriority'
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

function createDismissNodeAction(set: WorkspaceSet): WorkspaceNodeActions['dismissNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let dismissed = false;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (
        !node ||
        isProtectedRootNode(node) ||
        !hasNodeContent(node) ||
        !isReadingReviewItemNode(node) ||
        node.reading?.state === 'dismissed'
      ) {
        return state;
      }
      dismissed = true;
      const defaultPriority = getCurrentReviewSchedulerSettings().pushQueue.defaultPriority;
      const nextNode: Node = {
        ...node,
        reading: {
          intervalDurationMs: node.reading?.intervalDurationMs ?? 0,
          intervalGrowthFactor: node.reading?.intervalGrowthFactor ?? 1,
          lastHandledAt: node.reading?.lastHandledAt ?? now,
          nextAt: node.reading?.nextAt ?? now,
          priority: node.reading?.priority ?? defaultPriority,
          readingPosition: node.reading?.readingPosition ?? 0,
          repetitionCount: node.reading?.repetitionCount ?? 0,
          state: 'dismissed'
        },
        updatedAt: now
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
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return dismissed;
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
  const syncMovedNodes = (nodes: WorkspaceState['nodesById'][string][]) => {
    for (const node of nodes) {
      syncNodeContentToRuntime(node);
    }
  };
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
    createRootNode: createRootNodeAction(set, runtimeHandlers),
    createChildNode: createChildNodeAction(set, syncCreateNodeToRuntime, syncNodeOrderToRuntime),
    createVirtualNode: createVirtualNodeAction(set, syncCreateNodeToRuntime, syncNodeOrderToRuntime),
    createHighlightNodeFromSelection: createHighlightFromSelectionAction(set, runtimeHandlers),
    createImageClozeNodes: createImageClozeNodesAction(set, runtimeHandlers, reconcileReviewSession),
    createQANodeFromSelection: createQAFromSelectionAction(set, runtimeHandlers),
    deleteImageClozeRegion: trashActions.deleteImageClozeRegion,
    moveNode: createMoveNodeAction(set, syncMovedNodes, syncNodeOrderToRuntime),
    moveNodes: createMoveNodesAction(set, syncMovedNodes, syncNodeOrderToRuntime)
  };
}
