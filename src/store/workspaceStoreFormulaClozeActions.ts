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
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';
import { completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';
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
  localPatch: Partial<WorkspaceState> | null;
  node: WorkspaceNode | null;
  handlers: RuntimeSyncHandlers,
  nextNodeOrder: string[] | null;
  set: WorkspaceSet;
  }
) {
  const { handlers, localPatch, nextNodeOrder, node, set } = args;
  if (!node || !nextNodeOrder) {
    return null;
  }
  syncWorkspaceNodeDocumentCacheFromNode(node);
  markNodeCreatePending(node.id);
  const result = await handlers.syncNodeCreation(node, nextNodeOrder, node.id, nextNodeOrder.indexOf(node.id));
  if (result) {
    set((state) => createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, localPatch));
  }
  await completeNodeCreateRuntimePersist(node.id);
  return node.id;
}

export function createFormulaClozeNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  reconcileReviewSession: (state: WorkspaceState, activeNodeId?: string | null) => WorkspaceState['reviewSession']
): WorkspaceState['createFormulaClozeNode'] {
  return async (parentNodeId, payload, sourcePayload) => {
    const normalizedPayload = normalizeFormulaPayload(payload);
    const normalizedSourcePayload = normalizeFormulaClozeSourcePayload(sourcePayload);
    if (!normalizedPayload || normalizedSourcePayload.revealContent.length === 0) {
      return null;
    }
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;

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
      const nextState = {
        ...(operationEntry ? { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, operationEntry) } : {}),
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: nextNode.untitledSequenceByParent
      };
      localPatch = {
        ...nextState,
        reviewSession: reconcileReviewSession({ ...state, ...nextState })
      };
      return localPatch;
    });

    return applyCreatedFormulaClozeNode({
      handlers,
      localPatch,
      nextNodeOrder,
      node: createdNode,
      set
    });
  };
}
