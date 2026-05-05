import type { MutableRefObject } from 'react';

import {
  markNodePositionReady,
  markNodePositionRequested
} from '../../../shared/platform/performanceDiagnosticsProbe';
import { pushDebugTrace } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import { applyRestoreScrollTop } from './markdownEditorSelectionRestoreScroll';
import type { EditorViewState } from './markdownEditorTypes';

export function handleSelectionRestore(args: {
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreTarget: ReturnType<typeof resolveRestoreTarget>;
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  syncScrollMetrics: () => void;
}) {
  if (!args.restoreTarget) {
    if (!args.nodeId || !(args.readingSelection ?? args.nodeViewState?.selection)) {
      args.lastRestoredSelectionKeyRef.current = null;
    }
    return;
  }
  if (args.shouldSuppressSelectionRestore?.()) {
    args.lastRestoredSelectionKeyRef.current = args.restoreTarget.selectionKey;
    pushDebugTrace('editor.restore-selection.suppressed', {
      nodeId: args.restoreTarget.nodeId,
      selection: args.restoreTarget.selection
    });
    return;
  }
  restoreEditorSelection({
    adapter: args.restoreTarget.adapter,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
    nodeId: args.restoreTarget.nodeId,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
    restoreScrollTop: args.nodeViewState?.scrollTop,
    selectionKey: args.restoreTarget.selectionKey,
    selection: args.restoreTarget.selection,
    setReadingPositionSelection: args.setReadingPositionSelection
  });
  requestAnimationFrame(args.syncScrollMetrics);
}

export function resolveRestoreTarget(args: {
  adapter: CodeMirrorEditorAdapter | null;
  lastRestoredSelectionKey: string | null;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  value: string;
}) {
  const selection = args.readingSelection ?? args.nodeViewState?.selection;
  if (!args.nodeId || !selection || !args.adapter) {
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
    args.completeApplyingReadingPosition?.('editor-restore-selection-cancelled');
  }
}

function finishRestoreApplying(args: {
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  reason: string;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  args.isRestoreApplyingActiveRef.current = false;
  args.completeApplyingReadingPosition?.(args.reason);
  args.restoreCompletionFrameRef.current = null;
  args.restoreCompletionFrame2Ref.current = null;
  if (args.restoreCompletionTimeoutRef.current) {
    window.clearTimeout(args.restoreCompletionTimeoutRef.current);
    args.restoreCompletionTimeoutRef.current = null;
  }
}

function restoreEditorSelection(args: {
  adapter: CodeMirrorEditorAdapter;
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreScrollTop: number | undefined;
  selectionKey: string;
  selection: EditorViewState['selection'];
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
}) {
  markNodePositionRequested(args.nodeId);
  pushDebugTrace('editor.restore-selection', {
    nodeId: args.nodeId,
    selection: args.selection
  });
  clearRestoreCompletionTimers({
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
  });
  args.beginApplyingReadingPosition?.(args.selection, 'editor-restore-selection');
  args.isRestoreApplyingActiveRef.current = true;
  args.setReadingPositionSelection?.(args.selection);
  args.adapter.restoreSelection(args.selection);
  applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
  args.restoreCompletionFrameRef.current = requestAnimationFrame(() => {
    applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
    markNodePositionReady(args.nodeId);
    args.restoreCompletionFrame2Ref.current = requestAnimationFrame(() => {
      markRestoreSelectionSettled(args);
      finishRestoreApplying({
        completeApplyingReadingPosition: args.completeApplyingReadingPosition,
        isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
        reason: 'editor-restore-selection-settled',
        restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
        restoreCompletionFrameRef: args.restoreCompletionFrameRef,
        restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
      });
    });
  });
  args.restoreCompletionTimeoutRef.current = window.setTimeout(() => {
    markRestoreSelectionSettled(args);
    finishRestoreApplying({
      completeApplyingReadingPosition: args.completeApplyingReadingPosition,
      isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
      reason: 'editor-restore-selection-timeout',
      restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
      restoreCompletionFrameRef: args.restoreCompletionFrameRef,
      restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
    });
  }, 500);
}

function markRestoreSelectionSettled(args: {
  adapter: CodeMirrorEditorAdapter;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  restoreScrollTop: number | undefined;
  selection: EditorViewState['selection'];
  selectionKey: string;
}) {
  if (isRestoreScrollSettled(args.adapter, args.restoreScrollTop)) {
    args.lastRestoredSelectionKeyRef.current = args.selectionKey;
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

function isRestoreScrollSettled(adapter: CodeMirrorEditorAdapter, restoreScrollTop: number | undefined) {
  if (typeof restoreScrollTop !== 'number' || !Number.isFinite(restoreScrollTop) || restoreScrollTop <= 0) {
    return true;
  }
  return Math.abs(adapter.getScrollTop() - restoreScrollTop) <= 2;
}
