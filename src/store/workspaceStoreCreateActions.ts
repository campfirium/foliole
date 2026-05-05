import { deriveNodeTitleForCloze, deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';

import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createDefaultReviewProfile } from './workspaceSeed';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceState['nodesById'][string]) => void;
  syncNodeOrder: (nodeOrder: string[]) => void;
}

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createRootNode'] {
  return (content = '') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const createdNode = {
      id: nodeId,
      parentNodeId: null,
      title: deriveNodeTitleFromContent(content),
      content,
      anchorLink: null,
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    let nextNodeOrder: string[] = [];

    set((state) => {
      nextNodeOrder = [...state.nodeOrder, nodeId];
      const nextNodesById = {
        ...state.nodesById,
        [nodeId]: createdNode
      };
      return {
        activeNodeId: nodeId,
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        reviewSession: reconcileReviewSession(
          {
            ...state,
            activeNodeId: nodeId,
            nodeOrder: nextNodeOrder,
            nodesById: nextNodesById
          },
          nodeId
        )
      };
    });
    handlers.syncNodeContent(createdNode);
    handlers.syncNodeOrder(nextNodeOrder);
    return nodeId;
  };
}

export function createHighlightFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createHighlightNodeFromSelection'] {
  return (parentNodeId, content, anchorId) => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceState['nodesById'][string] | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }
      createdNode = {
        id: childNodeId,
        parentNodeId,
        title: deriveNodeTitleFromContent(normalizedContent),
        content: normalizedContent,
        anchorLink: anchorId ? { id: anchorId, kind: 'highlight' } : null,
        reveal: null,
        review: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      nextNodeOrder = [...state.nodeOrder, childNodeId];
      const nextNodesById = {
        ...state.nodesById,
        [childNodeId]: createdNode
      };
      return {
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        reviewSession: reconcileReviewSession({
          ...state,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById
        })
      };
    });
    if (createdNode && nextNodeOrder) {
      handlers.syncNodeContent(createdNode);
      handlers.syncNodeOrder(nextNodeOrder);
    }
    return childNodeId;
  };
}

export function createQAFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createQANodeFromSelection'] {
  return (parentNodeId, promptContent, answerContent, anchorId) => {
    const normalizedPrompt = promptContent.trim();
    const normalizedAnswer = answerContent.trim();
    if (!normalizedPrompt || !normalizedAnswer) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceState['nodesById'][string] | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }
      createdNode = {
        id: childNodeId,
        parentNodeId,
        title: deriveNodeTitleForCloze(normalizedPrompt, normalizedAnswer),
        content: normalizedPrompt,
        anchorLink: anchorId ? { id: anchorId, kind: 'cloze' } : null,
        reveal: normalizedAnswer,
        review: createDefaultReviewProfile(timestamp),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      nextNodeOrder = [...state.nodeOrder, childNodeId];
      const nextNodesById = {
        ...state.nodesById,
        [childNodeId]: createdNode
      };
      return {
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        reviewSession: reconcileReviewSession({
          ...state,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById
        })
      };
    });
    if (createdNode && nextNodeOrder) {
      handlers.syncNodeContent(createdNode);
      handlers.syncNodeOrder(nextNodeOrder);
    }
    return childNodeId;
  };
}
