import { deriveNodeTitleForCloze, deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';

import { createDefaultReviewProfile } from './workspaceSeed';
import type { WorkspaceState } from './workspaceStore';
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

function createUpdateNodeContentAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeContent'] {
  return (nodeId, content) => {
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
        return state;
      }
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: {
            ...node,
            content,
            title: deriveNodeTitleFromContent(content),
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  };
}

function createUpdateNodeRevealAction(set: WorkspaceSet): WorkspaceNodeActions['updateNodeReveal'] {
  return (nodeId, reveal) => {
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || node.reveal === null) {
        return state;
      }
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: {
            ...node,
            reveal,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  };
}

function createRootNodeAction(set: WorkspaceSet): WorkspaceNodeActions['createRootNode'] {
  return (content = '') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    set((state) => ({
      activeNodeId: nodeId,
      nodeOrder: [...state.nodeOrder, nodeId],
      nodesById: {
        ...state.nodesById,
        [nodeId]: {
          id: nodeId,
          parentNodeId: null,
          title: deriveNodeTitleFromContent(content),
          content,
          anchorLink: null,
          reveal: null,
          review: null,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }
    }));

    return nodeId;
  };
}

function createHighlightFromSelectionAction(set: WorkspaceSet): WorkspaceNodeActions['createHighlightNodeFromSelection'] {
  return (parentNodeId, content, anchorId) => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    set((state) => {
      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }
      return {
        nodeOrder: [...state.nodeOrder, childNodeId],
        nodesById: {
          ...state.nodesById,
          [childNodeId]: {
            id: childNodeId,
            parentNodeId,
            title: deriveNodeTitleFromContent(normalizedContent),
            content: normalizedContent,
            anchorLink: anchorId ? { id: anchorId, kind: 'highlight' } : null,
            reveal: null,
            review: null,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        }
      };
    });

    return childNodeId;
  };
}

function createQAFromSelectionAction(set: WorkspaceSet): WorkspaceNodeActions['createQANodeFromSelection'] {
  return (parentNodeId, promptContent, answerContent, anchorId) => {
    const normalizedPrompt = promptContent.trim();
    const normalizedAnswer = answerContent.trim();
    if (!normalizedPrompt || !normalizedAnswer) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    set((state) => {
      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }
      return {
        nodeOrder: [...state.nodeOrder, childNodeId],
        nodesById: {
          ...state.nodesById,
          [childNodeId]: {
            id: childNodeId,
            parentNodeId,
            title: deriveNodeTitleForCloze(normalizedPrompt, normalizedAnswer),
            content: normalizedPrompt,
            anchorLink: anchorId ? { id: anchorId, kind: 'cloze' } : null,
            reveal: normalizedAnswer,
            review: createDefaultReviewProfile(timestamp),
            createdAt: timestamp,
            updatedAt: timestamp
          }
        }
      };
    });

    return childNodeId;
  };
}

export function createWorkspaceNodeActions(set: WorkspaceSet): WorkspaceNodeActions {
  const trashActions = createWorkspaceTrashActions(set);
  return {
    ...trashActions,
    setNodeViewState: createSetNodeViewStateAction(set),
    updateNodeContent: createUpdateNodeContentAction(set),
    updateNodeReveal: createUpdateNodeRevealAction(set),
    createRootNode: createRootNodeAction(set),
    createChildNode: createChildNodeAction(set),
    createHighlightNodeFromSelection: createHighlightFromSelectionAction(set),
    createQANodeFromSelection: createQAFromSelectionAction(set),
    moveNode: createMoveNodeAction(set),
    moveNodes: createMoveNodesAction(set)
  };
}
