import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import {
  deriveNodeTitleForCloze,
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import type { NodeAnchorLink } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

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
  if (node.kind === 'folder') {
    handlers.syncNodeOrder(nodeOrder);
  }
}

function resolveRootCreationParentId(kind: NodeKind, state: WorkspaceState) {
  if (kind === 'folder') return null;
  if (!state.nodesById[INBOX_NODE_ID]) {
    throw new Error('Workspace invariant violated: Inbox node is missing.');
  }
  return INBOX_NODE_ID;
}

function createRootNodeRecord(args: {
  content: string;
  kind: NodeKind;
  nodeId: string;
  parentNodeId: string | null;
  state: WorkspaceState;
  timestamp: string;
}) {
  const untitledState = resolveCreatedNodeTitleState(
    deriveNodeTitleFromContent(args.content),
    args.parentNodeId,
    args.state
  );
  const node: WorkspaceNode = {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: args.kind,
    title: untitledState.title,
    hasContent: args.content.trim().length > 0,
    content: args.content,
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
  return { node, untitledState };
}

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createRootNode'] {
  return (content = '', kind: NodeKind = 'topic') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const parentNodeId = resolveRootCreationParentId(kind, state);
      const created = createRootNodeRecord({
        content,
        kind,
        nodeId,
        parentNodeId,
        state,
        timestamp
      });
      nextNodeOrder = parentNodeId === INBOX_NODE_ID
        ? [INBOX_NODE_ID, nodeId, ...state.nodeOrder.filter((id) => id !== INBOX_NODE_ID)]
        : [...state.nodeOrder, nodeId];
      createdNode = created.node;
      const nextNodesById = { ...state.nodesById, [nodeId]: createdNode };
      return {
        activeNodeId: nodeId,
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: created.untitledState.untitledSequenceByParent,
        reviewSession: reconcileReviewSession(
          {
            ...state,
            activeNodeId: nodeId,
            nodeOrder: nextNodeOrder,
            nodesById: nextNodesById,
            untitledSequenceByParent: created.untitledState.untitledSequenceByParent
          },
          nodeId
        )
      };
    });
    if (createdNode && nextNodeOrder) {
      handlers.syncNodeCreation(createdNode);
      if (kind === 'folder') {
        handlers.syncNodeOrder(nextNodeOrder);
      }
    }
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
        ...(anchorId !== undefined ? { anchorId } : {}),
        ...(anchorLink !== undefined ? { anchorLink } : {}),
        content: normalizedContent,
        ...(imageRegions !== undefined ? { imageRegions } : {}),
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

    const childNodeId = `node-${crypto.randomUUID()}`, timestamp = new Date().toISOString();
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
        ...(anchorId !== undefined ? { anchorId } : {}),
        ...(anchorLink !== undefined ? { anchorLink } : {}),
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
    if (createdNode) {
      handlers.syncNodeContent(createdNode);
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
