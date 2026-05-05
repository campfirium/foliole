import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import {
  deriveNodeTitleForCloze,
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import type { NodeAnchorLink } from '../features/nodes/model/nodeTypes';

import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createDefaultReviewProfile } from './workspaceSeed';
import type { WorkspaceState } from './workspaceStore';
import { createHighlightNodeRecord } from './workspaceStoreHighlightNodeRecord';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceState['nodesById'][string]) => void;
  syncNodeCreation: (node: WorkspaceState['nodesById'][string]) => void;
  syncNodeOrder: (nodeOrder: string[]) => void;
}

type WorkspaceNode = WorkspaceState['nodesById'][string];

function createQANodeRecord(args: {
  anchorId?: string;
  anchorLink?: NodeAnchorLink;
  answerContent: string;
  nodeId: string;
  parentNodeId: string;
  promptContent: string;
  timestamp: string;
  title: string;
}): WorkspaceNode {
  return {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: 'item',
    title: args.title,
    hasContent: args.promptContent.length > 0,
    content: args.promptContent,
    anchorLink: resolveClozeAnchorLink(args.anchorId, args.anchorLink),
    hasReveal: true,
    reveal: args.answerContent,
    review: createDefaultReviewProfile(args.timestamp),
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
}

function syncCreatedNode(node: WorkspaceNode | null, nodeOrder: string[] | null, handlers: RuntimeSyncHandlers) {
  if (!node || !nodeOrder) {
    return;
  }
  handlers.syncNodeContent(node);
  handlers.syncNodeOrder(nodeOrder);
}

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createRootNode'] {
  return (content = '', kind: NodeKind = 'topic') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode = {
      id: nodeId,
      parentNodeId: null,
      kind,
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
    handlers.syncNodeCreation(createdNode);
    handlers.syncNodeOrder(nextNodeOrder);
    return nodeId;
  };
}

export function createHighlightFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createHighlightNodeFromSelection'] {
  return (parentNodeId, content, anchorId, anchorLink, imageRegions) => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`, timestamp = new Date().toISOString();
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
      createdNode = createHighlightNodeRecord({
        anchorId,
        anchorLink,
        content: normalizedContent,
        imageRegions,
        nodeId: childNodeId,
        parentNodeId,
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
    syncCreatedNode(createdNode, nextNodeOrder, handlers);
    return childNodeId;
  };
}

export function createQAFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createQANodeFromSelection'] {
  return (parentNodeId, promptContent, answerContent, anchorId, anchorLink) => {
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
      const nextNode = createQANodeRecord({
        anchorId,
        anchorLink,
        answerContent: normalizedAnswer,
        nodeId: childNodeId,
        parentNodeId,
        promptContent: normalizedPrompt,
        timestamp,
        title: untitledState.title
      });
      createdNode = nextNode;
      nextNodeOrder = [...state.nodeOrder, childNodeId];
      const nextNodesById = {
        ...state.nodesById,
        [childNodeId]: nextNode
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

function resolveClozeAnchorLink(anchorId?: string, anchorLink?: NodeAnchorLink): NodeAnchorLink | null {
  if (anchorLink && anchorLink.kind === 'cloze' && typeof anchorLink.id === 'string' && anchorLink.id.trim().length > 0) {
    return anchorLink;
  }
  return null;
}
