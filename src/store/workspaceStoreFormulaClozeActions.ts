import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import {
  deriveFormulaClozeSelectionLabel,
  type FormulaClozeCreatePayload,
  type FormulaClozeSourcePayload
} from '../features/formula-cloze/model/formulaCloze';
import { deriveNodeTitleForCloze } from '../features/nodes/model/deriveNodeTitle';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import { createImageClozeReviewProfile } from './workspaceImageClozeReview';
import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import {
  removeCachedWorkspaceNodeDocument,
  syncWorkspaceNodeDocumentCacheFromNode
} from './workspaceNodeDocumentCache';
import {
  createWorkspaceNodeCreateAckPatch,
  didRuntimeConfirmNodeCreation
} from './workspaceNodeMutationPatch';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  cancelNodeCreateRuntimePersist,
  completeNodeCreateRuntimePersist
} from './workspaceStoreContentRuntimePersist';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceNode = WorkspaceState['nodesById'][string];

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceNode) => void;
  syncNodeCreation: (
    node: WorkspaceNode,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>;
}

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function normalizeFormulaClozeSourcePayload(sourcePayload: FormulaClozeSourcePayload) {
  return {
    promptContent: sourcePayload.promptContent.trim(),
    revealContent: sourcePayload.revealContent.trim()
  };
}

function normalizeFormulaPayload(payload: FormulaClozeCreatePayload): FormulaClozeCreatePayload | null {
  if (!payload.occurrenceKey.trim() || !payload.formulaSource.trim() || payload.selection.leaves.length === 0) {
    return null;
  }
  return {
    ...payload,
    formulaSource: payload.formulaSource.trim(),
    occurrenceKey: payload.occurrenceKey.trim()
  };
}

function normalizeFormulaCreateInput(payload: FormulaClozeCreatePayload, sourcePayload: FormulaClozeSourcePayload) {
  const normalizedPayload = normalizeFormulaPayload(payload);
  const normalizedSourcePayload = normalizeFormulaClozeSourcePayload(sourcePayload);
  if (!normalizedPayload || normalizedSourcePayload.revealContent.length === 0) return null;
  return { normalizedPayload, normalizedSourcePayload };
}

function createFormulaClozeNode(args: {
  parentNodeId: string;
  payload: FormulaClozeCreatePayload;
  sourcePayload: ReturnType<typeof normalizeFormulaClozeSourcePayload>;
  state: WorkspaceState;
  timestamp: string;
  untitledSequenceByParent: Record<string, number>;
}) {
  const nodeId = `node-${crypto.randomUUID()}`;
  const title =
    deriveFormulaClozeSelectionLabel(args.payload.selection) ||
    deriveNodeTitleForCloze(args.sourcePayload.promptContent, args.sourcePayload.revealContent);
  const untitledState = resolveCreatedNodeTitleState(title, args.parentNodeId, {
    ...args.state,
    untitledSequenceByParent: args.untitledSequenceByParent
  });
  const createdNode: WorkspaceNode = {
    id: nodeId,
    parentNodeId: args.parentNodeId,
    kind: 'item',
    title: untitledState.title,
    hasContent: args.sourcePayload.promptContent.length > 0,
    content: args.sourcePayload.promptContent,
    anchorLink: {
      id: `formula-${crypto.randomUUID()}`,
      kind: 'cloze',
      locator: {
        display: args.payload.display,
        fallbackRect: args.payload.selection.fallbackRect,
        formulaSource: args.payload.formulaSource,
        kind: 'formula-region',
        occurrenceKey: args.payload.occurrenceKey,
        selection: args.payload.selection
      }
    },
    hasReveal: true,
    reveal: args.sourcePayload.revealContent,
    review: createImageClozeReviewProfile(args.state, args.timestamp),
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };

  return {
    createdNode,
    untitledSequenceByParent: untitledState.untitledSequenceByParent
  };
}

async function applyCreatedFormulaClozeNode(
  args: {
  node: WorkspaceNode | null;
  handlers: RuntimeSyncHandlers,
  nextNodeOrder: string[] | null;
  get?: () => WorkspaceState;
  parentNodeId: string;
  set: WorkspaceSet;
  }
) {
  const { get, handlers, nextNodeOrder, node, parentNodeId, set } = args;
  if (!node || !nextNodeOrder) {
    return null;
  }
  syncWorkspaceNodeDocumentCacheFromNode(node);
  markNodeCreatePending(node.id);
  const result = await handlers.syncNodeCreation(
    node,
    nextNodeOrder,
    node.parentNodeId ?? node.id,
    nextNodeOrder.indexOf(node.id)
  );
  const runtimeConfirmed = didRuntimeConfirmNodeCreation(result, node.id);
  if (runtimeConfirmed && result) {
    set((state) => createWorkspaceNodeCreateAckPatch(state, result, [node.id]));
  }
  const succeeded = runtimeConfirmed || !hasWorkspaceNodeMutationRuntime();
  get?.().settleEditorAnnotationCreation({ annotationNodeIds: [node.id], nodeId: parentNodeId, succeeded });
  if (succeeded) await completeNodeCreateRuntimePersist(node.id);
  else {
    cancelNodeCreateRuntimePersist(node.id);
    removeCachedWorkspaceNodeDocument(node.id);
  }
  return succeeded ? node.id : null;
}

export function createFormulaClozeNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  reconcileReviewSession: (state: WorkspaceState, activeNodeId?: string | null) => WorkspaceState['reviewSession'],
  get?: () => WorkspaceState
): WorkspaceState['createFormulaClozeNode'] {
  return async (parentNodeId, payload, sourcePayload) => {
    const normalized = normalizeFormulaCreateInput(payload, sourcePayload);
    if (!normalized) return null;
    const { normalizedPayload, normalizedSourcePayload } = normalized;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }
      const nextNode = createFormulaClozeNode({
        parentNodeId,
        payload: normalizedPayload,
        sourcePayload: normalizedSourcePayload,
        state,
        timestamp,
        untitledSequenceByParent: state.untitledSequenceByParent
      });
      createdNode = nextNode.createdNode;
      nextNodeOrder = [...state.nodeOrder, nextNode.createdNode.id];
      const nextNodesById = {
        ...state.nodesById,
        [nextNode.createdNode.id]: nextNode.createdNode
      };
      const operationEntry = createEditorAnnotationCreateEntry([nextNode.createdNode], parentNodeId, nextNodeOrder);
      const localState = {
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: nextNode.untitledSequenceByParent
      };
      const localPatch = {
        ...localState,
        reviewSession: reconcileReviewSession({ ...state, ...localState })
      };
      return {
        ...localPatch,
        ...(operationEntry
          ? { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, operationEntry) }
          : {})
      };
    });

    return applyCreatedFormulaClozeNode({
      handlers,
      nextNodeOrder,
      node: createdNode,
      parentNodeId,
      set,
      ...(get ? { get } : {})
    });
  };
}
