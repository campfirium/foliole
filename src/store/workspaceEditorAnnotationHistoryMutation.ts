import { hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts';
import {
  getEditorOperationTopEntry,
  moveEditorOperationEntry,
  removeEditorOperationEntryFromStack,
  replaceEditorOperationEntry,
  replaceEditorOperationEntryWhere,
  type EditorAnnotationOperationEntry
} from '../features/editor/model/editorOperationHistory';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { commitAnnotationDelete as commitDelete, commitAnnotationRestore as commitRestore } from './workspaceEditorAnnotationTrash';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';

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
    const mutation = computeDeleteNodesMutation(state, result.deletedNodeIds, result.mutation.deletedAt, 'receipt');
    settledExactly = Boolean(
      mutation && current && current.type !== 'text.edit' && isApplyingEntry(current, entry, mode)
    );
    const history = finishSuccessfulHistory(state, result.entry, mode, current);
    if (mutation) for (const parent of result.entry.historyParents ?? []) {
      const original = state.nodesById[parent.nodeId];
      if (original && hashAnnotationValue(original.imageRegions) !== hashAnnotationValue(parent.before)) mutation.patch.nodesById[parent.nodeId] = original;
    }
    if (!mutation) return { editorOperationHistory: history };

    return {
      nodesById: mutation.patch.nodesById,
      navigation: mutation.patch.navigation,
      reviewSession: mutation.patch.reviewSession,
      trashedNodeDeletedAtById: mutation.patch.trashedNodeDeletedAtById,
      trashedNodeIds: mutation.patch.trashedNodeIds,
      editorOperationHistory: history
    };
  });
  onSettled?.(settledExactly);
}

function applyRestoredParentRegions(state: WorkspaceState, entry: EditorAnnotationOperationEntry) {
  const nodesById = { ...state.nodesById };
  for (const parent of entry.historyParents ?? []) {
    const current = nodesById[parent.nodeId];
    if (current && hashAnnotationValue(current.imageRegions) === hashAnnotationValue(parent.after)) nodesById[parent.nodeId] = { ...current, imageRegions: parent.before };
  }
  return nodesById;
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
      nodesById: applyRestoredParentRegions(state, entry),
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
  onCommitted?: (result: { mode: 'redo' | 'undo'; nodeIds: string[] }) => void;
  set: WorkspaceSet;
}) {
  const libraryScope = args.get().libraryScope;
  const set: WorkspaceSet = patch => {
    if (args.get().libraryScope === libraryScope) args.set(patch);
  };
  const onSettled = (succeeded: boolean) => {
    if (args.get().libraryScope === libraryScope) args.onSettled?.(succeeded);
  };
  set((state) => ({
    editorOperationHistory: replaceEditorOperationEntry(state.editorOperationHistory, args.entry.nodeId, args.mode, {
      ...args.entry,
      applyingMode: args.mode
    })
  }));
  const notifyFailure = () => {
    if (args.get().libraryScope === libraryScope) showAppRuntimeNotice(
      args.mode === 'undo' ? 'Undo could not be applied.' : 'Redo could not be applied.', 'error');
  };
  const shouldDelete = (args.entry.type === 'annotation.create') === (args.mode === 'undo');
  if (shouldDelete) {
    void commitDelete(args.entry, args.get(), args.get)
      .then((result) => {
        if (result) args.onCommitted?.({ mode: args.mode, nodeIds: result.deletedNodeIds });
        else notifyFailure();
        finishDelete(set, args.entry, args.mode, result, onSettled);
      })
      .catch(() => {
        notifyFailure();
        finishFailure(set, args.entry, args.mode);
        onSettled(false);
      });
  } else {
    void commitRestore(args.entry, args.get)
      .then((result) => {
        if (result) args.onCommitted?.({ mode: args.mode, nodeIds: result });
        else notifyFailure();
        finishRestore(set, args.entry, args.mode, result, onSettled);
      })
      .catch(() => {
        notifyFailure();
        finishFailure(set, args.entry, args.mode);
        onSettled(false);
      });
  }
  return true;
}
