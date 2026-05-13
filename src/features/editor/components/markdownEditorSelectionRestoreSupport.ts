import type { MutableRefObject } from 'react';

import { pushDebugTrace } from '../../../shared/diagnostics/debugTrace';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';
import { createEditorRestoreCommandKey } from '../model/editorRestoreCommand';
import {
  canEditorRestoreTargetMatchDocument,
  createEditorRestoreTarget,
  createEditorRestoreTargetKey
} from '../model/editorRestoreStateMachine';

import { shouldNotifyReadingPositionApply } from './markdownEditorRestoreNotify';
import { canRetryScrollOnlyRestore } from './markdownEditorRestoreRetry';
import { restoreEditorSelection } from './markdownEditorSelectionRestoreRunner';
import { normalizeRestoreSelection } from './markdownEditorSelectionRestoreTarget';
import type { EditorViewState } from './markdownEditorTypes';

export function handleSelectionRestore(args: {
  activeRestoreCommandIdRef: MutableRefObject<string | null>;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  activeRestoreValueLengthRef: MutableRefObject<number>;
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string, commandId?: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>, commandId?: string) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  readingRestoreCommandId: string | null | undefined;
  readingRestoreScrollTop: number | undefined;
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
    activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
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
    restoreCommandId: args.restoreTarget.restoreCommandId,
    restoreScrollTop: args.restoreTarget.restoreScrollTop,
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
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  readingRestoreCommandId: string | null | undefined;
  readingRestoreScrollTop: number | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  const hasCommandScrollTarget =
    typeof args.readingRestoreScrollTop === 'number' && args.readingRestoreScrollTop > 0;
  const hasCommandRestoreTarget = Boolean(args.readingRestoreCommandId && (args.readingSelection || hasCommandScrollTarget));
  if (!args.nodeId || !hasCommandRestoreTarget) {
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
  pendingRestoreSelectionKey: string | null;
  readingRestoreCommandId: string | null | undefined;
  readingRestoreScrollTop: number | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
  value: string;
}) {
  if (!args.nodeId || !args.adapter || !args.pendingRestoreSelectionKey || !args.readingRestoreCommandId) {
    return null;
  }
  const restoreContext = createRestoreTargetContext(args);
  if (!restoreContext) {
    return null;
  }
  if (!canEditorRestoreTargetMatchDocument(
    restoreContext.stateTarget,
    { nodeId: args.nodeId, valueLength: args.value.length }
  )) {
    return null;
  }
  const selectionKey = createRestoreSelectionKey(args, restoreContext.stateTarget);
  if (args.pendingRestoreSelectionKey !== selectionKey) {
    return null;
  }
  if (
    args.activeRestoreSelectionKey === selectionKey &&
    !canRetryScrollOnlyRestore(
      restoreContext.selection,
      restoreContext.restoreScrollTop,
      args.activeRestoreValueLength,
      args.value.length
    )
  ) {
    return null;
  }
  if (args.lastRestoredSelectionKey === selectionKey) {
    return null;
  }
  return {
    adapter: args.adapter,
    nodeId: args.nodeId,
    restoreCommandId: args.readingRestoreCommandId,
    restoreScrollTop: args.readingTargetViewportMode != null || typeof args.readingTargetViewportRatio === 'number' ? undefined : restoreContext.restoreScrollTop,
    selection: restoreContext.selection,
    shouldNotifyApplying: shouldNotifyReadingPositionApply(args),
    targetViewportMode: args.readingTargetViewportMode,
    selectionKey,
    targetViewportRatio: args.readingTargetViewportRatio
  };
}

function createRestoreSelectionKey(
  args: {
    readingRestoreCommandId: string | null | undefined;
    readingTargetViewportMode: EditorViewportMode | null | undefined;
  },
  stateTarget: NonNullable<ReturnType<typeof createEditorRestoreTarget>>
) {
  return args.readingRestoreCommandId
    ? createEditorRestoreCommandKey(args.readingRestoreCommandId)
    : createEditorRestoreTargetKey(stateTarget, args.readingTargetViewportMode);
}

function createRestoreTargetContext(args: {
  nodeId: string | null;
  readingRestoreScrollTop: number | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  const selection = args.readingSelection ? normalizeRestoreSelection(args.readingSelection) : null;
  const stateTarget = createEditorRestoreTarget({
    nodeId: args.nodeId,
    scrollTop: args.readingRestoreScrollTop,
    selectionFrom: selection?.from ?? null,
    selectionTo: selection?.to ?? null
  });
  if (!stateTarget) {
    return null;
  }
  return {
    restoreScrollTop: args.readingRestoreScrollTop,
    selection,
    stateTarget
  };
}
