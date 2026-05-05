import type { MutableRefObject } from 'react';

import { markNodePositionRequested } from '../../../shared/platform/performanceDiagnosticsProbe';
import { pushDebugTrace } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import {
  beginRestoreSelection,
  scheduleRestoreSelectionCompletion
} from './markdownEditorSelectionRestoreCompletion';
import type { EditorViewState } from './markdownEditorTypes';

export function handleSelectionRestore(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  readingSelection: EditorViewState['selection'] | null | undefined;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreTarget: ReturnType<typeof resolveRestoreTarget>;
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  syncScrollMetrics: () => void;
  valueLength: number;
}) {
  if (!args.restoreTarget) {
    if (!args.nodeId || !(args.readingSelection ?? args.nodeViewState?.selection)) {
      args.lastRestoredSelectionKeyRef.current = null;
      args.pendingRestoreSelectionKeyRef.current = null;
    }
    return;
  }
  if (args.shouldSuppressSelectionRestore?.()) {
    args.lastRestoredSelectionKeyRef.current = args.restoreTarget.selectionKey;
    args.pendingRestoreSelectionKeyRef.current = null;
    pushDebugTrace('editor.restore-selection.suppressed', {
      nodeId: args.restoreTarget.nodeId,
      selection: args.restoreTarget.selection
    });
    return;
  }
  restoreEditorSelection({
    adapter: args.restoreTarget.adapter,
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
    nodeId: args.restoreTarget.nodeId,
    pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
    restoreScrollTop: args.nodeViewState?.scrollTop,
    selectionKey: args.restoreTarget.selectionKey,
    selection: args.restoreTarget.selection,
    setReadingPositionSelection: args.setReadingPositionSelection,
    valueLength: args.valueLength
  });
  requestAnimationFrame(args.syncScrollMetrics);
}

export function resolveRestoreTarget(args: {
  adapter: CodeMirrorEditorAdapter | null;
  activeRestoreSelectionKey: string | null;
  activeRestoreValueLength: number;
  lastRestoredSelectionKey: string | null;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKey: string | null;
  readingSelection: EditorViewState['selection'] | null | undefined;
  value: string;
}) {
  const selection = args.readingSelection ?? args.nodeViewState?.selection;
  if (!args.nodeId || !selection || !args.adapter || !args.pendingRestoreSelectionKey) {
    return null;
  }
  const restoreScrollTop = args.nodeViewState?.scrollTop ?? 0;
  if (Math.max(selection.from, selection.to) > args.value.length) {
    return null;
  }
  if (args.value.length === 0 && (Math.max(selection.from, selection.to) > 0 || restoreScrollTop > 0)) {
    return null;
  }
  const selectionKey = `${args.nodeId}:${selection.from}:${selection.to}:${restoreScrollTop}`;
  if (args.pendingRestoreSelectionKey !== selectionKey) {
    return null;
  }
  if (
    args.activeRestoreSelectionKey === selectionKey &&
    !canRetryScrollOnlyRestore(selection, restoreScrollTop, args.activeRestoreValueLength, args.value.length)
  ) {
    return null;
  }
  if (args.lastRestoredSelectionKey === selectionKey) {
    return null;
  }
  return {
    adapter: args.adapter,
    nodeId: args.nodeId,
    selection,
    selectionKey
  };
}

export function clearRestoreCompletionTimers(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  const hadPendingCompletion =
    args.restoreCompletionFrameRef.current !== null ||
    args.restoreCompletionFrame2Ref.current !== null ||
    args.restoreCompletionTimeoutRef.current !== null;
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
  if (hadPendingCompletion && args.isRestoreApplyingActiveRef.current) {
    args.isRestoreApplyingActiveRef.current = false;
    args.activeRestoreSelectionKeyRef.current = null;
    args.completeApplyingReadingPosition?.('editor-restore-selection-cancelled');
  }
}

function restoreEditorSelection(args: {
  adapter: CodeMirrorEditorAdapter;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreScrollTop: number | undefined;
  selectionKey: string;
  selection: EditorViewState['selection'];
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  valueLength: number;
}) {
  markNodePositionRequested(args.nodeId);
  pushDebugTrace('editor.restore-selection', {
    nodeId: args.nodeId,
    selection: args.selection
  });
  beginRestoreSelection({
    adapter: args.adapter,
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    clearRestoreCompletionTimers: () =>
      clearRestoreCompletionTimers({
        activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
        completeApplyingReadingPosition: args.completeApplyingReadingPosition,
        isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
        restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
        restoreCompletionFrameRef: args.restoreCompletionFrameRef,
        restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
      }),
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    restoreScrollTop: args.restoreScrollTop,
    selection: args.selection,
    selectionKey: args.selectionKey,
    setReadingPositionSelection: args.setReadingPositionSelection,
    valueLength: args.valueLength
  });
  scheduleRestoreSelectionCompletion(args);
}

function canRetryScrollOnlyRestore(
  selection: EditorViewState['selection'],
  restoreScrollTop: number,
  activeRestoreValueLength: number,
  valueLength: number
) {
  return (
    selection.from === 0 &&
    selection.to === 0 &&
    restoreScrollTop > 0 &&
    valueLength > activeRestoreValueLength
  );
}
