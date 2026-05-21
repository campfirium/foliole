import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import { createQANodeFromSelectionRecord } from './workspaceQANodeRecord';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
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

function syncCreatedNode(node: WorkspaceNode | null, nodeOrder: string[] | null, handlers: RuntimeSyncHandlers) {
  if (!node || !nodeOrder) {
    return;
  }
  handlers.syncNodeContent(node);
  if (node.kind === 'folder') {
    handlers.syncNodeOrder(nodeOrder);
  }
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
      const operationEntry = createEditorAnnotationCreateEntry([createdNode], parentNodeId, nextNodeOrder);
      return {
        ...(operationEntry
          ? { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, operationEntry) }
          : {}),
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
      const created = createQANodeFromSelectionRecord({
        ...(anchorId !== undefined ? { anchorId } : {}),
        ...(anchorLink !== undefined ? { anchorLink } : {}),
        answerContent: normalizedAnswer,
        nodeId: childNodeId,
        parentNodeId,
        promptContent: normalizedPrompt,
        state,
        timestamp
      });
      createdNode = created.node;
      nextNodeOrder = [...state.nodeOrder, childNodeId];
      const nextNodesById = {
        ...state.nodesById,
        [childNodeId]: created.node
      };
      const operationEntry = createEditorAnnotationCreateEntry([created.node], parentNodeId, nextNodeOrder);
      return {
        ...(operationEntry
          ? { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, operationEntry) }
          : {}),
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: created.untitledSequenceByParent,
        reviewSession: reconcileReviewSession({
          ...state,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById,
          untitledSequenceByParent: created.untitledSequenceByParent
        })
      };
    });
    if (createdNode) {
      handlers.syncNodeContent(createdNode);
    }
    return childNodeId;
  };
}
