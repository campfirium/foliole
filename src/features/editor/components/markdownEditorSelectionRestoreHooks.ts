import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

import { clearRestoreCompletionTimers } from './markdownEditorSelectionRestoreSupport';
import { createPendingRestoreSelectionKey } from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

export function usePendingRestoreKey(args: {
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  previousNodeIdRef: MutableRefObject<string | null>;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  useLayoutEffect(() => {
    const nextPendingRestoreSelectionKey = createPendingRestoreSelectionKey(
      args.nodeId,
      args.readingSelection,
      args.nodeViewState
    );
    const nodeChanged = args.previousNodeIdRef.current !== args.nodeId;
    const readingRequestChanged =
      Boolean(args.readingSelection) &&
      args.pendingRestoreSelectionKeyRef.current !== nextPendingRestoreSelectionKey &&
      args.lastRestoredSelectionKeyRef.current !== nextPendingRestoreSelectionKey;
    if (!nodeChanged && !readingRequestChanged) {
      return;
    }
    args.previousNodeIdRef.current = args.nodeId;
    args.lastRestoredSelectionKeyRef.current = null;
    args.pendingRestoreSelectionKeyRef.current = nextPendingRestoreSelectionKey;
  }, [args]);
}

export function useRestoreCompletionCleanup(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: EditorViewState['selection']) => void) | undefined;
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
    [args]
  );
}
