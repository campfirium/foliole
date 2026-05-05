import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

import type { EditorViewportMode } from '../adapters/EditorAdapter';

import { clearRestoreCompletionTimers } from './markdownEditorSelectionRestoreSupport';
import {
  createPendingRestoreSelectionKey,
  normalizeRestoreSelection
} from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

export function usePendingRestoreKey(args: {
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string) => void) | undefined;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  previousNodeIdRef: MutableRefObject<string | null>;
  previousReadingSelectionRef: MutableRefObject<EditorViewState['selection'] | null | undefined>;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
}) {
  useLayoutEffect(() => {
    const nextPendingRestoreSelectionKey = createPendingRestoreSelectionKey(
      args.nodeId,
      args.readingSelection,
      args.nodeViewState,
      args.readingTargetViewportMode
    );
    const nodeChanged = args.previousNodeIdRef.current !== args.nodeId;
    const shouldStartRestore = shouldStartPendingRestore({
      lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
      nextPendingRestoreSelectionKey,
      pendingRestoreSelectionKey: args.pendingRestoreSelectionKeyRef.current,
      previousReadingSelection: args.previousReadingSelectionRef.current,
      readingSelection: args.readingSelection
    });
    const shouldClearPendingRestore = !nextPendingRestoreSelectionKey && args.pendingRestoreSelectionKeyRef.current !== null;
    if (!nodeChanged && !shouldStartRestore && !shouldClearPendingRestore) {
      args.previousReadingSelectionRef.current = args.readingSelection;
      return;
    }
    args.previousNodeIdRef.current = args.nodeId;
    args.previousReadingSelectionRef.current = args.readingSelection;
    if (nodeChanged || shouldStartRestore) {
      args.lastRestoredSelectionKeyRef.current = null;
    }
    args.pendingRestoreSelectionKeyRef.current = nextPendingRestoreSelectionKey;
    if (shouldStartRestore) {
      args.beginApplyingReadingPosition?.(resolvePendingRestoreSelection(args), 'editor-restore-pending');
    }
  }, [args]);
}

function shouldStartPendingRestore(args: {
  lastRestoredSelectionKey: string | null;
  nextPendingRestoreSelectionKey: string | null;
  pendingRestoreSelectionKey: string | null;
  previousReadingSelection: EditorViewState['selection'] | null | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  if (!args.nextPendingRestoreSelectionKey) {
    return false;
  }
  if (
    args.pendingRestoreSelectionKey !== args.nextPendingRestoreSelectionKey &&
    args.lastRestoredSelectionKey !== args.nextPendingRestoreSelectionKey
  ) {
    return true;
  }
  return Boolean(args.readingSelection) && args.previousReadingSelection !== args.readingSelection;
}

function resolvePendingRestoreSelection(args: {
  nodeViewState: EditorViewState | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  const selectionSource = args.readingSelection ?? args.nodeViewState?.selection;
  if (!selectionSource) {
    return { from: 0, to: 0 };
  }
  return normalizeRestoreSelection(selectionSource) ?? { from: 0, to: 0 };
}

export function useRestoreCompletionCleanup(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  useEffect(
    () => () =>
      clearRestoreCompletionTimers({
        activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
        completeApplyingReadingPosition: args.completeApplyingReadingPosition,
        isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
        pendingSelection: null,
        restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
        restoreCompletionFrameRef: args.restoreCompletionFrameRef,
        restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
      }),
    [
      args.activeRestoreSelectionKeyRef,
      args.completeApplyingReadingPosition,
      args.isRestoreApplyingActiveRef,
      args.restoreCompletionFrame2Ref,
      args.restoreCompletionFrameRef,
      args.restoreCompletionTimeoutRef
    ]
  );
}
