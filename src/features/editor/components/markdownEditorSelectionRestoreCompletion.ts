import type { MutableRefObject } from 'react';

import { markNodePositionReady } from '../../../shared/platform/performanceDiagnosticsProbe';
import { pushDebugTrace } from '../../../shared/diagnostics/debugTrace';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';

import { applyRestoreScrollTop } from './markdownEditorSelectionRestoreScroll';
import { shouldCollapseSelectionAfterRestore } from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

const RESTORE_SELECTION_TIMEOUT_MS = 180;
const RESTORE_UNLOCK_COOLDOWN_MS = 150;
const RESTORE_SCROLL_SETTLE_TOLERANCE_PX = 8;
const RATIO_COMPLETION_MAX_ATTEMPTS = 12;
const RATIO_COMPLETION_TIMEOUT_MS = 300;
type RestoreSelection = NonNullable<EditorViewState['selection']> | null;

export function finishRestoreApplying(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  reason: string;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  selection: RestoreSelection;
}) {
  args.isRestoreApplyingActiveRef.current = false;
  args.activeRestoreSelectionKeyRef.current = null;
  args.restoreCompletionFrameRef.current = null;
  args.restoreCompletionFrame2Ref.current = null;
  if (args.restoreCompletionTimeoutRef.current) {
    window.clearTimeout(args.restoreCompletionTimeoutRef.current);
    args.restoreCompletionTimeoutRef.current = null;
  }
  window.setTimeout(() => {
    args.completeApplyingReadingPosition?.(args.reason, args.selection ?? undefined);
  }, RESTORE_UNLOCK_COOLDOWN_MS);
}

export function markRestoreSelectionSettled(args: {
  adapter: CodeMirrorEditorAdapter;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreScrollTop: number | undefined;
  selection: RestoreSelection;
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
  clearRestoreCompletionTimers: () => void;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  restoreScrollTop: number | undefined;
  selection: RestoreSelection;
  selectionKey: string;
  targetViewportMode: EditorViewportMode | null | undefined;
  targetViewportRatio: number | null | undefined;
  valueLength: number;
}) {
  args.clearRestoreCompletionTimers();
  args.isRestoreApplyingActiveRef.current = true;
  args.activeRestoreSelectionKeyRef.current = args.selectionKey;
  args.activeRestoreValueLengthRef.current = args.valueLength;
  if (!args.selection) {
    applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
    return;
  }
  if (args.targetViewportMode === 'center' && args.adapter.revealSelectionCentered) {
    args.adapter.setSelection(args.selection);
    args.adapter.revealSelectionCentered(args.selection);
    return;
  }
  if (args.targetViewportMode === 'nearest') {
    args.adapter.restoreSelection(args.selection);
    return;
  }
  if (typeof args.targetViewportRatio === 'number' && args.adapter.revealSelectionAtViewportRatio) {
    args.adapter.setSelection(args.selection);
    args.adapter.revealSelectionAtViewportRatio(args.selection, args.targetViewportRatio);
    return;
  }
  args.adapter.restoreSelection(args.selection);
  args.adapter.setSelection(args.selection);
  applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
}

export function scheduleRestoreSelectionCompletion(args: {
  adapter: CodeMirrorEditorAdapter;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreScrollTop: number | undefined;
  selection: RestoreSelection;
  selectionKey: string;
  targetViewportMode: EditorViewportMode | null | undefined;
  targetViewportRatio: number | null | undefined;
}) {
  if (args.targetViewportMode != null || typeof args.targetViewportRatio !== 'number') {
    scheduleNonRatioCompletion(args);
    return;
  }
  scheduleRatioCompletion(args);
}

function scheduleNonRatioCompletion(args: Parameters<typeof scheduleRestoreSelectionCompletion>[0]) {
  args.restoreCompletionFrameRef.current = requestAnimationFrame(() => {
    args.restoreCompletionFrame2Ref.current = requestAnimationFrame(() => {
      tryCompleteRestoreSelection(args, 'editor-restore-selection-settled');
    });
  });
  args.restoreCompletionTimeoutRef.current = window.setTimeout(() => {
    tryCompleteRestoreSelection(args, 'editor-restore-selection-timeout');
  }, RESTORE_SELECTION_TIMEOUT_MS);
}

function scheduleRatioCompletion(args: Parameters<typeof scheduleRestoreSelectionCompletion>[0]) {
  let attemptsRemaining = RATIO_COMPLETION_MAX_ATTEMPTS;
  const pollSettled = () => {
    if (tryCompleteRestoreSelection(args, 'editor-restore-selection-settled')) {
      return;
    }
    attemptsRemaining -= 1;
    if (attemptsRemaining > 0) {
      args.restoreCompletionFrameRef.current = requestAnimationFrame(pollSettled);
    }
  };
  args.restoreCompletionFrameRef.current = requestAnimationFrame(pollSettled);
  args.restoreCompletionTimeoutRef.current = window.setTimeout(() => {
    tryCompleteRestoreSelection(args, 'editor-restore-selection-timeout');
  }, RATIO_COMPLETION_TIMEOUT_MS);
}

function isRestoreScrollSettled(adapter: CodeMirrorEditorAdapter, restoreScrollTop: number | undefined) {
  if (typeof restoreScrollTop !== 'number' || !Number.isFinite(restoreScrollTop) || restoreScrollTop <= 0) {
    return true;
  }
  return Math.abs(adapter.getScrollTop() - restoreScrollTop) <= RESTORE_SCROLL_SETTLE_TOLERANCE_PX;
}

function isRestoreViewportRatioSettled(
  adapter: CodeMirrorEditorAdapter,
  selection: RestoreSelection,
  targetViewportRatio: number | null | undefined
) {
  if (typeof targetViewportRatio !== 'number') {
    return true;
  }
  if (!selection || typeof adapter.isPositionNearViewportRatio !== 'function') {
    return false;
  }
  return adapter.isPositionNearViewportRatio(selection.from, targetViewportRatio, 0.05);
}

function tryCompleteRestoreSelection(
  args: {
    adapter: CodeMirrorEditorAdapter;
    activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
    completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
    isRestoreApplyingActiveRef: MutableRefObject<boolean>;
    lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
    nodeId: string;
    pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
    restoreCompletionFrame2Ref: MutableRefObject<number | null>;
    restoreCompletionFrameRef: MutableRefObject<number | null>;
    restoreCompletionTimeoutRef: MutableRefObject<number | null>;
    restoreScrollTop: number | undefined;
    selection: RestoreSelection;
    selectionKey: string;
    targetViewportRatio: number | null | undefined;
  },
  reason: string
) {
  applyRestoreScrollTop(args.adapter, args.restoreScrollTop);
  markNodePositionReady(args.nodeId);
  if (
    reason !== 'editor-restore-selection-timeout' &&
    (!isRestoreScrollSettled(args.adapter, args.restoreScrollTop) ||
      !isRestoreViewportRatioSettled(args.adapter, args.selection, args.targetViewportRatio))
  ) {
    return false;
  }
  const collapsedSelection = args.selection ? shouldCollapseSelectionAfterRestore(args.selection) : undefined;
  if (collapsedSelection) {
    args.adapter.setSelection(collapsedSelection);
  }
  markRestoreSelectionSettled(args);
  finishRestoreApplying({
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    reason,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
    selection: args.selection
  });
  return true;
}
