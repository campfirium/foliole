import { deriveNodeTitleFromContent, UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { type WorkspaceState } from './workspaceStore';
import {
  createHighlightFromSelectionAction,
  createQAFromSelectionAction,
  createRootNodeAction
} from './workspaceStoreCreateActions';
import { createWorkspaceTrashActions } from './workspaceStoreTrashActions';
import { createChildNodeAction, createMoveNodeAction, createMoveNodesAction } from './workspaceStoreTreeActions';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type WorkspaceNodeActions = Pick<
  WorkspaceState,
  | 'createChildNode'
  | 'createHighlightNodeFromSelection'
  | 'createQANodeFromSelection'
  | 'createRootNode'
  | 'deleteNode'
  | 'deleteNodePermanently'
  | 'moveNode'
  | 'moveNodes'
  | 'restoreNode'
  | 'setNodeViewState'
  | 'updateNodeTitle'
  | 'updateNodeContent'
  | 'updateNodeReveal'
>;

function createSetNodeViewStateAction(set: WorkspaceSet): WorkspaceNodeActions['setNodeViewState'] {
  return (nodeId, viewState) => {
    set((state) => {
      if (!state.nodesById[nodeId]) {
        return state;
      }
      return {
        nodeViewById: {
          ...state.nodeViewById,
          [nodeId]: {
            scrollTop: Math.max(0, viewState.scrollTop),
            selection: {
              from: Math.max(0, viewState.selection.from),
              to: Math.max(0, viewState.selection.to)
            }
          }
        }
      };
    });
  };
}

function createUpdateNodeTitleAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeTitle'] {
  return (nodeId, title) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
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
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}

function createUpdateNodeContentAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeContent'] {
  return (nodeId, content) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
        return state;
      }
      const derivedTitle = deriveNodeTitleFromContent(content);
      const nextNode = {
        ...node,
        content,
        title: node.isTitleManual ? node.title : derivedTitle,
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
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}

function createUpdateNodeRevealAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeReveal'] {
  return (nodeId, reveal) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || node.reveal === null) {
        return state;
      }
      const nextNode = {
        ...node,
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
    updateNodeReveal: createUpdateNodeRevealAction(set),
    createRootNode: createRootNodeAction(set, runtimeHandlers),
    createChildNode: createChildNodeAction(set, syncNodeContentToRuntime, syncNodeOrderToRuntime),
    createHighlightNodeFromSelection: createHighlightFromSelectionAction(set, runtimeHandlers),
    createQANodeFromSelection: createQAFromSelectionAction(set, runtimeHandlers),
    moveNode: createMoveNodeAction(set, syncMovedNodes, syncNodeOrderToRuntime),
    moveNodes: createMoveNodesAction(set, syncMovedNodes, syncNodeOrderToRuntime)
  };
}
