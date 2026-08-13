import {
  getEditorOperationSession,
  removeEditorOperationEntry,
  replaceEditorOperationEntryWhere,
  type EditorAnnotationOperationEntry,
  type EditorOperationHistoryEntry
} from '../features/editor/model/editorOperationHistory';

import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';

type WorkspaceSet = (
  partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)
) => void;
type AnnotationCreationSettlementOutcome = 'confirmed-nontop' | 'confirmed-top' | 'failed' | 'ignored';

export function isSameEditorAnnotationEntry(
  entry: EditorOperationHistoryEntry | null | undefined,
  nodeIds: string[],
  type?: EditorAnnotationOperationEntry['type']
) {
  return Boolean(
    entry &&
    entry.type !== 'text.edit' &&
    (!type || entry.type === type) &&
    entry.annotations.map(({ nodeId }) => nodeId).join('|') === nodeIds.join('|')
  );
}

function rollbackPendingCreation(state: WorkspaceState, nodeId: string, nodeIds: string[]) {
  const mutation = computeDeleteNodesMutation(state, nodeIds);
  const nodesById = { ...(mutation?.patch.nodesById ?? state.nodesById) };
  nodeIds.forEach((id) => delete nodesById[id]);
  const removed = new Set(nodeIds);
  const nodeOrder = state.nodeOrder.filter((id) => !removed.has(id));
  const trashedNodeDeletedAtById = { ...state.trashedNodeDeletedAtById };
  nodeIds.forEach((id) => delete trashedNodeDeletedAtById[id]);
  const nextState = {
    ...state,
    nodeOrder,
    nodesById,
    trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds.filter((id) => !removed.has(id))
  };
  return {
    editorOperationHistory: removeEditorOperationEntry(
      state.editorOperationHistory,
      nodeId,
      (entry) => isSameEditorAnnotationEntry(entry, nodeIds, 'annotation.create')
    ),
    nodeOrder,
    nodesById,
    rendererBoundaryKeepNodeIds: state.rendererBoundaryKeepNodeIds.filter((id) => !removed.has(id)),
    reviewSession: reconcileReviewSession(nextState, state.activeNodeId),
    trashedNodeDeletedAtById,
    trashedNodeIds: nextState.trashedNodeIds
  };
}

export function confirmPendingEditorAnnotationEntry(state: WorkspaceState, nodeId: string, nodeIds: string[]) {
  const session = getEditorOperationSession(state.editorOperationHistory, nodeId);
  let entryIndex = -1;
  for (let index = session.undoStack.length - 1; index >= 0; index -= 1) {
    const candidate = session.undoStack[index];
    if (candidate && candidate.type !== 'text.edit' && candidate.canonical === 'pending' &&
      isSameEditorAnnotationEntry(candidate, nodeIds)) {
      entryIndex = index;
      break;
    }
  }
  const entry = session.undoStack[entryIndex];
  if (!entry || entry.type === 'text.edit') return null;
  return {
    history: replaceEditorOperationEntryWhere(
      state.editorOperationHistory,
      nodeId,
      'undo',
      (candidate) => candidate === entry,
      () => ({ ...entry, canonical: 'confirmed' })
    ),
    wasTop: entryIndex === session.undoStack.length - 1
  };
}

export function settleEditorAnnotationCreation(
  set: WorkspaceSet,
  result: { annotationNodeIds: string[]; nodeId: string; succeeded: boolean }
): AnnotationCreationSettlementOutcome {
  let outcome: AnnotationCreationSettlementOutcome = 'ignored';
  set((state) => {
    if (!result.succeeded) {
      outcome = 'failed';
      return rollbackPendingCreation(state, result.nodeId, result.annotationNodeIds);
    }
    const confirmed = confirmPendingEditorAnnotationEntry(state, result.nodeId, result.annotationNodeIds);
    if (!confirmed) return state;
    outcome = confirmed.wasTop ? 'confirmed-top' : 'confirmed-nontop';
    return { editorOperationHistory: confirmed.history };
  });
  return outcome as AnnotationCreationSettlementOutcome;
}
