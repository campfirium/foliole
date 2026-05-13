import type { MutableRefObject } from 'react';

import { pushDebugTrace } from '../../../shared/diagnostics/debugTrace';
import { markNodePositionRequested } from '../../../shared/platform/performanceDiagnosticsProbe';
import type { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';

import {
  beginRestoreSelection,
  scheduleRestoreSelectionCompletion
} from './markdownEditorSelectionRestoreCompletion';
import type { EditorViewState } from './markdownEditorTypes';

export function clearRestoreCompletionTimers(args: {
  activeRestoreCommandIdRef: MutableRefObject<string | null>;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>, commandId?: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  pendingSelection: EditorViewState['selection'] | null;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  const hadPendingCompletion =
    args.restoreCompletionFrameRef.current !== null ||
    args.restoreCompletionFrame2Ref.current !== null ||
    args.restoreCompletionTimeoutRef.current !== null;
  cancelRestoreCompletionTimers(args);
  if (!hadPendingCompletion || !args.isRestoreApplyingActiveRef.current) {
    return;
  }
  args.isRestoreApplyingActiveRef.current = false;
  const commandId = args.activeRestoreCommandIdRef.current;
  args.activeRestoreCommandIdRef.current = null;
  args.activeRestoreSelectionKeyRef.current = null;
  if (commandId) {
    args.completeApplyingReadingPosition?.('editor-restore-selection-cancelled', args.pendingSelection ?? undefined, commandId);
    return;
  }
  args.completeApplyingReadingPosition?.('editor-restore-selection-cancelled', args.pendingSelection ?? undefined);
}

function cancelRestoreCompletionTimers(args: {
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  if (args.restoreCompletionFrameRef.current) {
    cancelAnimationFrame(args.restoreCompletionFrameRef.current);
    args.restoreCompletionFrameRef.current = null;
  }
  if (args.restoreCompletionFrame2Ref.current) {
    cancelAnimationFrame(args.restoreCompletionFrame2Ref.current);
    args.restoreCompletionFrame2Ref.current = null;
  }
  if (args.restoreCompletionTimeoutRef.current) {
    window.clearTimeout(args.restoreCompletionTimeoutRef.current);
    args.restoreCompletionTimeoutRef.current = null;
  }
}

export function restoreEditorSelection(args: {
  adapter: CodeMirrorEditorAdapter;
  activeRestoreCommandIdRef: MutableRefObject<string | null>;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string, commandId?: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>, commandId?: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreCommandId: string | null;
  restoreScrollTop: number | undefined;
  selectionKey: string;
  selection: NonNullable<EditorViewState['selection']> | null;
  shouldNotifyApplying: boolean;
  targetViewportMode: EditorViewportMode | null | undefined;
  targetViewportRatio: number | null | undefined;
  valueLength: number;
}) {
  markNodePositionRequested(args.nodeId);
  if (args.shouldNotifyApplying) {
    args.beginApplyingReadingPosition?.(args.selection ?? { from: 0, to: 0 }, 'editor-restore-selection', args.restoreCommandId ?? undefined);
  }
  pushDebugTrace('editor.restore-selection', {
    nodeId: args.nodeId,
    selection: args.selection,
    targetViewportMode: args.targetViewportMode ?? null,
    targetViewportRatio: args.targetViewportRatio ?? null
  });
  beginRestoreSelection({
    adapter: args.adapter,
    activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
    clearRestoreCompletionTimers: () =>
      clearRestoreCompletionTimers({
        activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
        activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
        completeApplyingReadingPosition: args.completeApplyingReadingPosition,
        isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
        pendingSelection: args.selection,
        restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
        restoreCompletionFrameRef: args.restoreCompletionFrameRef,
        restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
      }),
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    restoreCommandId: args.restoreCommandId,
    restoreScrollTop: args.restoreScrollTop,
    selection: args.selection,
    selectionKey: args.selectionKey,
    targetViewportMode: args.targetViewportMode,
    targetViewportRatio: args.targetViewportRatio,
    valueLength: args.valueLength
  });
  scheduleRestoreSelectionCompletion(args);
}
