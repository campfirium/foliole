import {
  getEditorOperationTopEntry,
  moveEditorOperationEntry,
  removeEditorOperationEntryFromStack,
  replaceEditorOperationEntry,
  replaceEditorOperationEntryWhere,
  type EditorAnnotationOperationEntry
} from '../features/editor/model/editorOperationHistory';

import { reconcileReviewSession } from './workspaceReviewSessionSync';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;
type WorkspaceGet = () => WorkspaceState;

function isSameEntry(left: EditorAnnotationOperationEntry | null, right: EditorAnnotationOperationEntry) {
  return left?.type === right.type &&
    left.annotations.map(({ nodeId }) => nodeId).join('|') === right.annotations.map(({ nodeId }) => nodeId).join('|');
}

function isApplyingEntry(
  candidate: EditorAnnotationOperationEntry | null,
  entry: EditorAnnotationOperationEntry,
  mode: 'redo' | 'undo'
) {
  return isSameEntry(candidate, entry) && candidate?.applyingMode === mode;
}

function confirmsExactNodeSet(expectedNodeIds: string[], acceptedNodeIds: string[]) {
  if (acceptedNodeIds.length !== expectedNodeIds.length) return false;
  const accepted = new Set(acceptedNodeIds);
  return expectedNodeIds.every((nodeId) => accepted.has(nodeId));
}

function confirmedDeleteResult(mutation: DeleteNodeMutationResult, deletedNodeIds?: string[]) {
  const acceptedIds = deletedNodeIds ?? mutation.nodeIds;
  return confirmsExactNodeSet(mutation.nodeIds, acceptedIds) ? acceptedIds : null;
}

async function commitDelete(entry: EditorAnnotationOperationEntry, snapshot: WorkspaceState) {
  const mutation = computeDeleteNodesMutation(snapshot, entry.annotations.map(({ nodeId }) => nodeId));
  if (!mutation) return null;
  const result = await syncSoftDeleteNodesToRuntime({ deletedAt: mutation.deletedAt, nodeIds: mutation.nodeIds });
  const deletedNodeIds = result?.deletedNodeIds ?? (!hasWorkspaceNodeMutationRuntime() ? mutation.nodeIds : undefined);
  return confirmedDeleteResult(mutation, deletedNodeIds) ? { deletedNodeIds: deletedNodeIds!, mutation } : null;
}

async function commitRestore(entry: EditorAnnotationOperationEntry) {
  const nodeIds = entry.annotations.map(({ nodeId }) => nodeId);
  const result = await syncRestoreNodesToRuntime({ nodeIds });
  const restoredNodeIds = result?.restoredNodeIds ?? (!hasWorkspaceNodeMutationRuntime() ? nodeIds : []);
  return confirmsExactNodeSet(nodeIds, restoredNodeIds) ? restoredNodeIds : null;
}

function createRestorePatch(state: WorkspaceState, restoredNodeIds: string[]) {
  const restored = new Set(restoredNodeIds);
  const trashedNodeDeletedAtById = { ...state.trashedNodeDeletedAtById };
  restoredNodeIds.forEach((id) => delete trashedNodeDeletedAtById[id]);
  const trashedNodeIds = state.trashedNodeIds.filter((id) => !restored.has(id));
  return {
    reviewSession: reconcileReviewSession({ ...state, trashedNodeDeletedAtById, trashedNodeIds }, state.activeNodeId),
    trashedNodeDeletedAtById,
    trashedNodeIds
  };
}

function finishDelete(
  set: WorkspaceSet,
  entry: EditorAnnotationOperationEntry,
  mode: 'redo' | 'undo',
  result: Awaited<ReturnType<typeof commitDelete>>,
  onSettled?: (succeeded: boolean) => void
) {
  if (!result) {
    finishFailure(set, entry, mode);
    onSettled?.(false);
    return;
  }
  let settledExactly = false;
  set((state) => {
    const current = getEditorOperationTopEntry(state.editorOperationHistory, entry.nodeId, mode);
    const mutation = computeDeleteNodesMutation(state, result.deletedNodeIds, result.mutation.deletedAt);
    settledExactly = Boolean(
      mutation && current && current.type !== 'text.edit' && isApplyingEntry(current, entry, mode)
    );
    const history = finishSuccessfulHistory(state, entry, mode, current);
    if (!mutation) return { editorOperationHistory: history };
    mutation.parentNodesToSync.forEach(syncNodeContentToRuntime);
    return {
      nodesById: mutation.patch.nodesById,
      reviewSession: mutation.patch.reviewSession,
      trashedNodeDeletedAtById: mutation.patch.trashedNodeDeletedAtById,
      trashedNodeIds: mutation.patch.trashedNodeIds,
      editorOperationHistory: history
    };
  });
  onSettled?.(settledExactly);
}

function finishRestore(
  set: WorkspaceSet,
  entry: EditorAnnotationOperationEntry,
  mode: 'redo' | 'undo',
  restoredNodeIds: string[] | null,
  onSettled?: (succeeded: boolean) => void
) {
  if (!restoredNodeIds) {
    finishFailure(set, entry, mode);
    onSettled?.(false);
    return;
  }
  let settledExactly = false;
  set((state) => {
    const current = getEditorOperationTopEntry(state.editorOperationHistory, entry.nodeId, mode);
    settledExactly = Boolean(
      current && current.type !== 'text.edit' && isApplyingEntry(current, entry, mode)
    );
    return {
      ...createRestorePatch(state, restoredNodeIds),
      editorOperationHistory: finishSuccessfulHistory(state, entry, mode, current)
    };
  });
  onSettled?.(settledExactly);
}

function finishSuccessfulHistory(
  state: WorkspaceState,
  entry: EditorAnnotationOperationEntry,
  mode: 'redo' | 'undo',
  current: ReturnType<typeof getEditorOperationTopEntry>
) {
  const matchingTop = current?.type !== 'text.edit' && isApplyingEntry(current, entry, mode);
  if (matchingTop) {
    const idleHistory = replaceEditorOperationEntry(state.editorOperationHistory, entry.nodeId, mode, entry);
    return moveEditorOperationEntry(idleHistory, entry.nodeId, mode);
  }
  return removeEditorOperationEntryFromStack(
    state.editorOperationHistory,
    entry.nodeId,
    mode,
    (candidate) => candidate.type !== 'text.edit' && isApplyingEntry(candidate, entry, mode)
  );
}

function finishFailure(set: WorkspaceSet, entry: EditorAnnotationOperationEntry, mode: 'redo' | 'undo') {
  const idleEntry = { ...entry };
  delete idleEntry.applyingMode;
  set((state) => ({
    editorOperationHistory: replaceEditorOperationEntryWhere(
      state.editorOperationHistory,
      entry.nodeId,
      mode,
      (candidate) => candidate.type !== 'text.edit' && isApplyingEntry(candidate, entry, mode),
      () => idleEntry
    )
  }));
}

export function startEditorAnnotationHistoryMutation(args: {
  entry: EditorAnnotationOperationEntry;
  get: WorkspaceGet;
  mode: 'redo' | 'undo';
  onSettled?: (succeeded: boolean) => void;
  set: WorkspaceSet;
}) {
  args.set((state) => ({
    editorOperationHistory: replaceEditorOperationEntry(state.editorOperationHistory, args.entry.nodeId, args.mode, {
      ...args.entry,
      applyingMode: args.mode
    })
  }));
  const shouldDelete = (args.entry.type === 'annotation.create') === (args.mode === 'undo');
  if (shouldDelete) {
    void commitDelete(args.entry, args.get())
      .then((result) => finishDelete(args.set, args.entry, args.mode, result, args.onSettled))
      .catch(() => {
        finishFailure(args.set, args.entry, args.mode);
        args.onSettled?.(false);
      });
  } else {
    void commitRestore(args.entry)
      .then((result) => finishRestore(args.set, args.entry, args.mode, result, args.onSettled))
      .catch(() => {
        finishFailure(args.set, args.entry, args.mode);
        args.onSettled?.(false);
      });
  }
  return true;
}
