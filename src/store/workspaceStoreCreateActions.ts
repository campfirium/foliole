import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import {
  removeCachedWorkspaceNodeDocument,
  syncWorkspaceNodeDocumentCacheFromNode
} from './workspaceNodeDocumentCache';
import {
  createWorkspaceNodeCreateAckPatch,
  didRuntimeConfirmNodeCreation
} from './workspaceNodeMutationPatch';
import { createQANodeFromSelectionRecord } from './workspaceQANodeRecord';
import { RECENT_RENDERER_BOUNDARY_NODE_LIMIT } from './workspaceRendererBoundaryKeepNodeIds';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  cancelNodeCreateRuntimePersist,
  completeNodeCreateRuntimePersist
} from './workspaceStoreContentRuntimePersist';
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

function buildAnnotationCreatePatch(args: {
  createdNode: WorkspaceNode;
  parentNodeId: string;
  state: WorkspaceState;
  untitledSequenceByParent: WorkspaceState['untitledSequenceByParent'];
}) {
  const nodeOrder = [...args.state.nodeOrder, args.createdNode.id];
  const nodesById = { ...args.state.nodesById, [args.createdNode.id]: args.createdNode };
  const operationEntry = createEditorAnnotationCreateEntry([args.createdNode], args.parentNodeId, nodeOrder);
  const localPatch = {
    nodeOrder,
    nodesById,
    rendererBoundaryKeepNodeIds: keepCreatedNodeDocumentInRendererBoundary(args.state, args.createdNode.id),
    reviewSession: reconcileReviewSession({
      ...args.state,
      nodeOrder,
      nodesById,
      untitledSequenceByParent: args.untitledSequenceByParent
    }),
    untitledSequenceByParent: args.untitledSequenceByParent
  };
  return {
    nodeOrder,
    patch: {
      ...localPatch,
      ...(operationEntry
        ? { editorOperationHistory: pushEditorOperationEntry(args.state.editorOperationHistory, operationEntry) }
        : {})
    }
  };
}

function keepCreatedNodeDocumentInRendererBoundary(state: WorkspaceState, nodeId: string) {
  return [
    nodeId,
    ...state.rendererBoundaryKeepNodeIds.filter((keepNodeId) => keepNodeId !== nodeId)
  ].slice(0, RECENT_RENDERER_BOUNDARY_NODE_LIMIT);
}

async function applyCreatedNode(args: {
  activeNodeId: string;
  handlers: RuntimeSyncHandlers;
  node: WorkspaceNode | null;
  nodeId: string;
  nodeOrder: string[] | null;
  get?: () => WorkspaceState;
  set: WorkspaceSet;
}) {
  const { activeNodeId, get, handlers, node, nodeId, nodeOrder, set } = args;
  if (!node || !nodeOrder) {
    return null;
  }
  syncWorkspaceNodeDocumentCacheFromNode(node);
  markNodeCreatePending(nodeId);
  const result = await handlers.syncNodeCreation(node, nodeOrder, activeNodeId, nodeOrder.indexOf(nodeId));
  const runtimeConfirmed = didRuntimeConfirmNodeCreation(result, nodeId);
  if (runtimeConfirmed && result) {
    set((state) => createWorkspaceNodeCreateAckPatch(state, result, [nodeId]));
  }
  const succeeded = runtimeConfirmed || !hasWorkspaceNodeMutationRuntime();
  get?.().settleEditorAnnotationCreation({ annotationNodeIds: [nodeId], nodeId: activeNodeId, succeeded });
  if (succeeded) await completeNodeCreateRuntimePersist(nodeId);
  else {
    cancelNodeCreateRuntimePersist(nodeId);
    removeCachedWorkspaceNodeDocument(nodeId);
  }
  return succeeded ? nodeId : null;
}

export function createHighlightFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  get?: () => WorkspaceState
): WorkspaceState['createHighlightNodeFromSelection'] {
  return async (parentNodeId, content, anchorId, anchorLink, imageRegions) => {
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
      const next = buildAnnotationCreatePatch({
        createdNode,
        parentNodeId,
        state,
        untitledSequenceByParent: untitledState.untitledSequenceByParent
      });
      nextNodeOrder = next.nodeOrder;
      return next.patch;
    });
    return applyCreatedNode({
      activeNodeId: parentNodeId,
      handlers,
      node: createdNode,
      nodeId: childNodeId,
      nodeOrder: nextNodeOrder,
      set,
      ...(get ? { get } : {})
    });
  };
}

export function createQAFromSelectionAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  get?: () => WorkspaceState
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
      const next = buildAnnotationCreatePatch({
        createdNode: created.node,
        parentNodeId,
        state,
        untitledSequenceByParent: created.untitledSequenceByParent
      });
      nextNodeOrder = next.nodeOrder;
      return next.patch;
    });
    return applyCreatedNode({
      activeNodeId: parentNodeId,
      handlers,
      node: createdNode,
      nodeId: childNodeId,
      nodeOrder: nextNodeOrder,
      set,
      ...(get ? { get } : {})
    });
  };
}
