import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import type { FormulaClozeCreatePayload, FormulaClozeSourcePayload } from '../features/formula-cloze/model/formulaCloze';
import { deriveNodeTitleForCloze } from '../features/nodes/model/deriveNodeTitle';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import { createImageClozeReviewProfile } from './workspaceImageClozeReview';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceNode = WorkspaceState['nodesById'][string];

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceNode) => void;
  syncNodeCreation: (node: WorkspaceNode) => void;
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
  const title = deriveNodeTitleForCloze(args.sourcePayload.promptContent, args.sourcePayload.revealContent);
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

function syncCreatedFormulaClozeNode(
  node: WorkspaceNode | null,
  handlers: RuntimeSyncHandlers,
  nextNodeOrder: string[] | null
) {
  if (!node || !nextNodeOrder) {
    return [];
  }
  handlers.syncNodeCreation(node);
  return [node.id];
}

export function createFormulaClozeNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  reconcileReviewSession: (state: WorkspaceState, activeNodeId?: string | null) => WorkspaceState['reviewSession']
): WorkspaceState['createFormulaClozeNode'] {
  return (parentNodeId, payload, sourcePayload) => {
    const normalizedPayload = normalizeFormulaPayload(payload);
    const normalizedSourcePayload = normalizeFormulaClozeSourcePayload(sourcePayload);
    if (!normalizedPayload || normalizedSourcePayload.revealContent.length === 0) {
      return null;
    }
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
      const nextState = {
        ...(operationEntry ? { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, operationEntry) } : {}),
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: nextNode.untitledSequenceByParent
      };
      return {
        ...nextState,
        reviewSession: reconcileReviewSession({ ...state, ...nextState })
      };
    });

    return syncCreatedFormulaClozeNode(createdNode, handlers, nextNodeOrder)[0] ?? null;
  };
}
