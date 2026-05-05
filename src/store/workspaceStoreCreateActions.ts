import {
  deriveNodeTitleForCloze,
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';

import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createDefaultReviewProfile } from './workspaceSeed';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

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

function createQANodeRecord(args: {
  anchorId?: string;
  answerContent: string;
  nodeId: string;
  parentNodeId: string;
  promptContent: string;
  timestamp: string;
  title: string;
}) {
  return {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    title: args.title,
    hasContent: args.promptContent.length > 0,
    content: args.promptContent,
    anchorLink: args.anchorId ? { id: args.anchorId, kind: 'cloze' as const } : null,
    hasReveal: true,
    reveal: args.answerContent,
    review: createDefaultReviewProfile(args.timestamp),
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
}

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createRootNode'] {
  return (content = '') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode = {
      id: nodeId,
      parentNodeId: null,
      title: deriveNodeTitleFromContent(content),
      hasContent: content.trim().length > 0,
      content,
      anchorLink: null,
      hasReveal: false,
      reveal: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    let nextNodeOrder: string[] = [];

    set((state) => {
      const untitledState = resolveCreatedNodeTitleState(
        deriveNodeTitleFromContent(content),
        null,
        state
      );
      nextNodeOrder = [...state.nodeOrder, nodeId];
      createdNode = {
        ...createdNode,
        title: untitledState.title
      };
      const nextNodesById = { ...state.nodesById, [nodeId]: createdNode };
      return {
        activeNodeId: nodeId,
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: untitledState.untitledSequenceByParent,
        reviewSession: reconcileReviewSession(
          {
            ...state,
            activeNodeId: nodeId,
            nodeOrder: nextNodeOrder,
            nodesById: nextNodesById,
            untitledSequenceByParent: untitledState.untitledSequenceByParent
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
      const untitledState = resolveCreatedNodeTitleState(
        deriveNodeTitleFromContent(normalizedContent),
        parentNodeId,
        state
      );
      createdNode = {
        id: childNodeId,
        parentNodeId,
        title: untitledState.title,
        hasContent: normalizedContent.length > 0,
        content: normalizedContent,
        anchorLink: anchorId ? { id: anchorId, kind: 'highlight' } : null,
        hasReveal: false,
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
        untitledSequenceByParent: untitledState.untitledSequenceByParent,
        reviewSession: reconcileReviewSession({
          ...state,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById,
          untitledSequenceByParent: untitledState.untitledSequenceByParent
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
      const untitledState = resolveCreatedNodeTitleState(
        deriveNodeTitleForCloze(normalizedPrompt, normalizedAnswer),
        parentNodeId,
        state
      );
      createdNode = createQANodeRecord({
        anchorId,
        answerContent: normalizedAnswer,
        nodeId: childNodeId,
        parentNodeId,
        promptContent: normalizedPrompt,
        timestamp,
        title: untitledState.title
      });
      nextNodeOrder = [...state.nodeOrder, childNodeId];
      const nextNodesById = {
        ...state.nodesById,
        [childNodeId]: createdNode
      };
      return {
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: untitledState.untitledSequenceByParent,
        reviewSession: reconcileReviewSession({
          ...state,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById,
          untitledSequenceByParent: untitledState.untitledSequenceByParent
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
