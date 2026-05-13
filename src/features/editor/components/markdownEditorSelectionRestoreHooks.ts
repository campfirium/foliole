import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

import type { EditorViewportMode } from '../adapters/EditorAdapter';

import { clearRestoreCompletionTimers } from './markdownEditorSelectionRestoreRunner';
import {
  createPendingRestoreSelectionKey,
} from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

export function usePendingRestoreKey(args: {
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  readingRestoreCommandId: string | null | undefined;
  readingRestoreScrollTop: number | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
}) {
  useLayoutEffect(() => {
    const nextPendingRestoreSelectionKey = createPendingRestoreSelectionKey(
      args.nodeId,
      args.readingSelection,
      args.readingRestoreScrollTop,
      args.readingTargetViewportMode,
      args.readingRestoreCommandId
    );
    const shouldStartRestore = shouldStartPendingRestore({
      lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
      nextPendingRestoreSelectionKey,
      pendingRestoreSelectionKey: args.pendingRestoreSelectionKeyRef.current,
      readingRestoreCommandId: args.readingRestoreCommandId
    });
    const shouldClearPendingRestore = !nextPendingRestoreSelectionKey && args.pendingRestoreSelectionKeyRef.current !== null;
    if (!shouldStartRestore && !shouldClearPendingRestore) {
      return;
    }
    if (shouldStartRestore) {
      args.lastRestoredSelectionKeyRef.current = null;
    }
    args.pendingRestoreSelectionKeyRef.current = nextPendingRestoreSelectionKey;
  }, [args]);
}

function shouldStartPendingRestore(args: {
  lastRestoredSelectionKey: string | null;
  nextPendingRestoreSelectionKey: string | null;
  pendingRestoreSelectionKey: string | null;
  readingRestoreCommandId: string | null | undefined;
}) {
  if (!args.nextPendingRestoreSelectionKey || !args.readingRestoreCommandId) {
    return false;
  }
  return (
    args.pendingRestoreSelectionKey !== args.nextPendingRestoreSelectionKey &&
    args.lastRestoredSelectionKey !== args.nextPendingRestoreSelectionKey
  );
}

export function useRestoreCompletionCleanup(args: {
  activeRestoreCommandIdRef: MutableRefObject<string | null>;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>, commandId?: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  useEffect(
    () => () =>
      clearRestoreCompletionTimers({
        activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
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
      args.activeRestoreCommandIdRef,
      args.completeApplyingReadingPosition,
      args.isRestoreApplyingActiveRef,
      args.restoreCompletionFrame2Ref,
      args.restoreCompletionFrameRef,
      args.restoreCompletionTimeoutRef
    ]
  );
}
