import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

import type { EditorViewportMode } from '../adapters/EditorAdapter';

import { clearRestoreCompletionTimers } from './markdownEditorSelectionRestoreSupport';
import {
  createPendingRestoreSelectionKey,
  normalizeRestoreSelection
} from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

export function usePendingRestoreKey(args: {
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string, commandId?: string) => void) | undefined;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  passiveRestoreNodeIdRef: MutableRefObject<string | null>;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  previousNodeIdRef: MutableRefObject<string | null>;
  previousReadingSelectionRef: MutableRefObject<EditorViewState['selection'] | null | undefined>;
  readingRestoreCommandId: string | null | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
}) {
  useLayoutEffect(() => {
    const nextPendingRestoreSelectionKey = createPendingRestoreSelectionKey(
      args.nodeId,
      args.readingSelection,
      args.nodeViewState,
      args.readingTargetViewportMode,
      args.readingRestoreCommandId
    );
    const nodeChanged = args.previousNodeIdRef.current !== args.nodeId;
    const shouldStartRestore = shouldStartPendingRestore({
      lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
      nodeChanged,
      nextPendingRestoreSelectionKey,
      passiveRestoreNodeId: args.passiveRestoreNodeIdRef.current,
      pendingRestoreSelectionKey: args.pendingRestoreSelectionKeyRef.current,
      readingRestoreCommandId: args.readingRestoreCommandId,
      nodeId: args.nodeId
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
    if (nodeChanged) {
      args.passiveRestoreNodeIdRef.current = null;
    }
    if (shouldStartRestore && !args.readingRestoreCommandId) {
      args.passiveRestoreNodeIdRef.current = args.nodeId;
    }
    args.pendingRestoreSelectionKeyRef.current = nextPendingRestoreSelectionKey;
    if (shouldStartRestore && !nodeChanged && !args.readingRestoreCommandId) {
      args.beginApplyingReadingPosition?.(resolvePendingRestoreSelection(args), 'editor-restore-pending');
    }
  }, [args]);
}

function shouldStartPendingRestore(args: {
  lastRestoredSelectionKey: string | null;
  nodeChanged: boolean;
  nodeId: string | null;
  nextPendingRestoreSelectionKey: string | null;
  passiveRestoreNodeId: string | null;
  pendingRestoreSelectionKey: string | null;
  readingRestoreCommandId: string | null | undefined;
}) {
  if (!args.nextPendingRestoreSelectionKey) {
    return false;
  }
  if (args.readingRestoreCommandId) {
    return (
      args.pendingRestoreSelectionKey !== args.nextPendingRestoreSelectionKey &&
      args.lastRestoredSelectionKey !== args.nextPendingRestoreSelectionKey
    );
  }
  if (args.nodeChanged) {
    return true;
  }
  if (args.nodeId && args.passiveRestoreNodeId !== args.nodeId && args.lastRestoredSelectionKey !== args.nextPendingRestoreSelectionKey) {
    return true;
  }
  return false;
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
