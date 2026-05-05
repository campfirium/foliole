import type { MutableRefObject } from 'react';

import { markNodePositionRequested } from '../../../shared/platform/performanceDiagnosticsProbe';
import { pushDebugTrace } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';
import {
  canEditorRestoreTargetMatchDocument,
  createEditorRestoreTarget,
  createEditorRestoreTargetKey
} from '../model/editorRestoreStateMachine';

import { shouldNotifyReadingPositionApply } from './markdownEditorRestoreNotify';
import { canRetryScrollOnlyRestore } from './markdownEditorRestoreRetry';
import {
  beginRestoreSelection,
  scheduleRestoreSelectionCompletion
} from './markdownEditorSelectionRestoreCompletion';
import { normalizeRestoreSelection, resolveRestoreScrollTop } from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

export function handleSelectionRestore(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  restoreTarget: ReturnType<typeof resolveRestoreTarget>;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  valueLength: number;
}) {
  if (!args.restoreTarget) {
    clearRestoreTrackingWhenEmpty(args);
    return;
  }
  if (args.shouldSuppressSelectionRestore?.()) {
    markSuppressedRestore({
      lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
      pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
      restoreTarget: args.restoreTarget
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
    restoreScrollTop:
      args.restoreTarget.targetViewportMode != null || typeof args.restoreTarget.targetViewportRatio === 'number'
        ? undefined
        : args.nodeViewState?.scrollTop,
    selectionKey: args.restoreTarget.selectionKey,
    selection: args.restoreTarget.selection,
    shouldNotifyApplying: args.restoreTarget.shouldNotifyApplying,
    targetViewportMode: args.restoreTarget.targetViewportMode,
    targetViewportRatio: args.restoreTarget.targetViewportRatio,
    valueLength: args.valueLength
  });
}

function clearRestoreTrackingWhenEmpty(args: {
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  const hasScrollOnlyTarget = typeof args.nodeViewState?.scrollTop === 'number' && args.nodeViewState.scrollTop > 0;
  if (!args.nodeId || (!(args.readingSelection ?? args.nodeViewState?.selection) && !hasScrollOnlyTarget)) {
    args.lastRestoredSelectionKeyRef.current = null;
    args.pendingRestoreSelectionKeyRef.current = null;
  }
}

function markSuppressedRestore(args: {
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreTarget: NonNullable<ReturnType<typeof resolveRestoreTarget>>;
}) {
  if (
    args.restoreTarget.targetViewportMode == null &&
    typeof args.restoreTarget.targetViewportRatio !== 'number'
  ) {
    args.lastRestoredSelectionKeyRef.current = args.restoreTarget.selectionKey;
    args.pendingRestoreSelectionKeyRef.current = null;
  }
  pushDebugTrace('editor.restore-selection.suppressed', {
    nodeId: args.restoreTarget.nodeId,
    selection: args.restoreTarget.selection
  });
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
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
  value: string;
}) {
  const selectionSource = args.readingSelection ?? args.nodeViewState?.selection;
  const selection = selectionSource ? normalizeRestoreSelection(selectionSource) : null;
  if (!args.nodeId || !args.adapter || !args.pendingRestoreSelectionKey) {
    return null;
  }
  const restoreScrollTop = resolveRestoreScrollTop(args.readingSelection, args.nodeViewState);
  const stateTarget = createEditorRestoreTarget({
    nodeId: args.nodeId,
    scrollTop: restoreScrollTop,
    selectionFrom: selection?.from ?? null,
    selectionTo: selection?.to ?? null
  });
  if (!stateTarget) {
    return null;
  }
  if (!canEditorRestoreTargetMatchDocument(
    stateTarget,
    { nodeId: args.nodeId, valueLength: args.value.length }
  )) {
    return null;
  }
  const selectionKey = createEditorRestoreTargetKey(stateTarget, args.readingTargetViewportMode);
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
    shouldNotifyApplying: shouldNotifyReadingPositionApply(args),
    targetViewportMode: args.readingTargetViewportMode,
    selectionKey,
    targetViewportRatio: args.readingTargetViewportRatio
  };
}

export function clearRestoreCompletionTimers(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
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
    args.completeApplyingReadingPosition?.('editor-restore-selection-cancelled', args.pendingSelection ?? undefined);
  }
}

function restoreEditorSelection(args: {
  adapter: CodeMirrorEditorAdapter;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
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
    args.beginApplyingReadingPosition?.(args.selection ?? { from: 0, to: 0 }, 'editor-restore-selection');
  }
  pushDebugTrace('editor.restore-selection', {
    nodeId: args.nodeId,
    selection: args.selection,
    targetViewportMode: args.targetViewportMode ?? null,
    targetViewportRatio: args.targetViewportRatio ?? null
  });
  beginRestoreSelection({
    adapter: args.adapter,
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
    clearRestoreCompletionTimers: () =>
      clearRestoreCompletionTimers({
        activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
        completeApplyingReadingPosition: args.completeApplyingReadingPosition,
        isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
        pendingSelection: args.selection,
        restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
        restoreCompletionFrameRef: args.restoreCompletionFrameRef,
        restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
      }),
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    restoreScrollTop: args.restoreScrollTop,
    selection: args.selection,
    selectionKey: args.selectionKey,
    targetViewportMode: args.targetViewportMode,
    targetViewportRatio: args.targetViewportRatio,
    valueLength: args.valueLength
  });
  scheduleRestoreSelectionCompletion(args);
}
