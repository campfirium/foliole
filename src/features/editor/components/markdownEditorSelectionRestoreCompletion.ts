import type { MutableRefObject } from 'react';

import { markNodePositionReady } from '../../../shared/platform/performanceDiagnosticsProbe';
import { pushDebugTrace } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import { applyRestoreScrollTop } from './markdownEditorSelectionRestoreScroll';
import type { EditorViewState } from './markdownEditorTypes';

const RESTORE_SELECTION_TIMEOUT_MS = 180;
const RESTORE_SCROLL_SETTLE_TOLERANCE_PX = 8;

export function finishRestoreApplying(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  reason: string;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  args.isRestoreApplyingActiveRef.current = false;
  args.activeRestoreSelectionKeyRef.current = null;
  args.completeApplyingReadingPosition?.(args.reason);
  args.restoreCompletionFrameRef.current = null;
  args.restoreCompletionFrame2Ref.current = null;
  if (args.restoreCompletionTimeoutRef.current) {
    window.clearTimeout(args.restoreCompletionTimeoutRef.current);
    args.restoreCompletionTimeoutRef.current = null;
  }
}

export function markRestoreSelectionSettled(args: {
  adapter: CodeMirrorEditorAdapter;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreScrollTop: number | undefined;
  selection: EditorViewState['selection'];
  selectionKey: string;
}) {
  if (isRestoreScrollSettled(args.adapter, args.restoreScrollTop)) {
    args.lastRestoredSelectionKeyRef.current = args.selectionKey;
    args.pendingRestoreSelectionKeyRef.current = null;
    return;
  }
  args.lastRestoredSelectionKeyRef.current = null;
  pushDebugTrace('editor.restore-selection.pending-retry', {
    nodeId: args.nodeId,
    selection: args.selection,
    restoreScrollTop: args.restoreScrollTop,
    currentScrollTop: args.adapter.getScrollTop()
  });
}

export function beginRestoreSelection(args: {
  adapter: CodeMirrorEditorAdapter;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined;
  clearRestoreCompletionTimers: () => void;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  restoreScrollTop: number | undefined;
  selection: EditorViewState['selection'];
  selectionKey: string;
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  valueLength: number;
}) {
  args.clearRestoreCompletionTimers();
  args.beginApplyingReadingPosition?.(args.selection, 'editor-restore-selection');
  args.isRestoreApplyingActiveRef.current = true;
  args.activeRestoreSelectionKeyRef.current = args.selectionKey;
  args.activeRestoreValueLengthRef.current = args.valueLength;
  args.setReadingPositionSelection?.(args.selection);
  args.adapter.restoreSelection(args.selection);
  applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
}

export function scheduleRestoreSelectionCompletion(args: {
  adapter: CodeMirrorEditorAdapter;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreScrollTop: number | undefined;
  selection: EditorViewState['selection'];
  selectionKey: string;
}) {
  if (tryCompleteRestoreSelection(args, 'editor-restore-selection-settled')) {
    return;
  }
  args.restoreCompletionFrameRef.current = requestAnimationFrame(() => {
    if (tryCompleteRestoreSelection(args, 'editor-restore-selection-settled')) {
      return;
    }
    args.restoreCompletionFrame2Ref.current = requestAnimationFrame(() => {
      tryCompleteRestoreSelection(args, 'editor-restore-selection-settled');
    });
  });
  args.restoreCompletionTimeoutRef.current = window.setTimeout(() => {
    tryCompleteRestoreSelection(args, 'editor-restore-selection-timeout');
  }, RESTORE_SELECTION_TIMEOUT_MS);
}

function isRestoreScrollSettled(adapter: CodeMirrorEditorAdapter, restoreScrollTop: number | undefined) {
  if (typeof restoreScrollTop !== 'number' || !Number.isFinite(restoreScrollTop) || restoreScrollTop <= 0) {
    return true;
  }
  return Math.abs(adapter.getScrollTop() - restoreScrollTop) <= RESTORE_SCROLL_SETTLE_TOLERANCE_PX;
}

function tryCompleteRestoreSelection(
  args: {
    adapter: CodeMirrorEditorAdapter;
    activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
    completeApplyingReadingPosition: ((reason: string) => void) | undefined;
    isRestoreApplyingActiveRef: MutableRefObject<boolean>;
    lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
    nodeId: string;
    pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
    restoreCompletionFrame2Ref: MutableRefObject<number | null>;
    restoreCompletionFrameRef: MutableRefObject<number | null>;
    restoreCompletionTimeoutRef: MutableRefObject<number | null>;
    restoreScrollTop: number | undefined;
    selection: EditorViewState['selection'];
    selectionKey: string;
  },
  reason: string
) {
  applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
  markNodePositionReady(args.nodeId);
  if (reason !== 'editor-restore-selection-timeout' && !isRestoreScrollSettled(args.adapter, args.restoreScrollTop)) {
    return false;
  }
  markRestoreSelectionSettled(args);
  finishRestoreApplying({
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    reason,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
  });
  return true;
}
