import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import { createQANodeFromSelectionRecord } from './workspaceQANodeRecord';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';
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
  syncNodeCreation: (
    node: WorkspaceState['nodesById'][string],
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>;
  syncNodeOrder: (nodeOrder: string[]) => void;
}

type WorkspaceNode = WorkspaceState['nodesById'][string];

async function applyCreatedNode(args: {
  activeNodeId: string;
  handlers: RuntimeSyncHandlers;
  localPatch: Partial<WorkspaceState> | null;
  node: WorkspaceNode | null;
  nodeId: string;
  nodeOrder: string[] | null;
  set: WorkspaceSet;
}) {
  const { activeNodeId, handlers, localPatch, node, nodeId, nodeOrder, set } = args;
  if (!node || !nodeOrder) {
    return null;
  }
  markNodeCreatePending(nodeId);
  const result = await handlers.syncNodeCreation(node, nodeOrder, activeNodeId, nodeOrder.indexOf(nodeId));
  if (result) {
    set((state) => createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, localPatch));
  }
  await completeNodeCreateRuntimePersist(nodeId);
  return nodeId;
}

export function createHighlightFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createHighlightNodeFromSelection'] {
  return async (parentNodeId, content, anchorId, anchorLink, imageRegions) => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`, timestamp = new Date().toISOString();
    let createdNode: WorkspaceState['nodesById'][string] | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;

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
      localPatch = {
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
      return localPatch;
    });
    return applyCreatedNode({ activeNodeId: parentNodeId, handlers, localPatch, node: createdNode, nodeId: childNodeId, nodeOrder: nextNodeOrder, set });
  };
}

export function createQAFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createQANodeFromSelection'] {
  return async (parentNodeId, promptContent, answerContent, anchorId, anchorLink) => {
    const normalizedPrompt = promptContent.trim();
    const normalizedAnswer = answerContent.trim();
    if (!normalizedPrompt || !normalizedAnswer) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`, timestamp = new Date().toISOString();
    let createdNode: WorkspaceState['nodesById'][string] | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;

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
      localPatch = {
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
      return localPatch;
    });
    return applyCreatedNode({ activeNodeId: parentNodeId, handlers, localPatch, node: createdNode, nodeId: childNodeId, nodeOrder: nextNodeOrder, set });
  };
}
