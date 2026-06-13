import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';

import type { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';
import type { EditorRestoreSelectionMode } from '../model/editorRestoreCommand';

import {
  handleSelectionRestore,
  resolveRestoreTarget
} from './markdownEditorSelectionRestoreSupport';
import type { EditorViewState } from './markdownEditorTypes';

const RESTORE_USER_SCROLL_INTERRUPT_GRACE_MS = 32;

interface SelectionRestoreExecutionArgs {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
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
  readingSelectionMode: EditorRestoreSelectionMode | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  value: string;
}

export function useSelectionRestoreExecution(args: SelectionRestoreExecutionArgs) {
  const activeRestoreStartedAtRef = useRef<{ key: string; startedAt: number } | null>(null);

  useLayoutEffect(() => {
    runSelectionRestore({
      adapter: args.adapterRef.current,
      activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
      activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
      activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
      beginApplyingReadingPosition: args.beginApplyingReadingPosition,
      completeApplyingReadingPosition: args.completeApplyingReadingPosition,
      isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
      lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
      nodeId: args.nodeId,
      pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
      readingRestoreCommandId: args.readingRestoreCommandId,
      readingRestoreScrollTop: args.readingRestoreScrollTop,
      readingSelection: args.readingSelection,
      readingSelectionMode: args.readingSelectionMode,
      readingTargetViewportMode: args.readingTargetViewportMode,
      readingTargetViewportRatio: args.readingTargetViewportRatio,
      restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
      restoreCompletionFrameRef: args.restoreCompletionFrameRef,
      restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
      shouldSuppressSelectionRestore: args.shouldSuppressSelectionRestore,
      value: args.value
    });
  }, [args]);

  useLayoutEffect(() => {
    const activeKey = args.activeRestoreSelectionKeyRef.current;
    if (!activeKey || !args.isRestoreApplyingActiveRef.current) {
      activeRestoreStartedAtRef.current = null;
      return;
    }
    if (activeRestoreStartedAtRef.current?.key !== activeKey) {
      activeRestoreStartedAtRef.current = { key: activeKey, startedAt: Date.now() };
    }
  }, [args]);

  useRestoreUserScrollCancellation(args, activeRestoreStartedAtRef);
}

function useRestoreUserScrollCancellation(
  args: SelectionRestoreExecutionArgs,
  activeRestoreStartedAtRef: MutableRefObject<{ key: string; startedAt: number } | null>
) {
  useEffect(() => {
    const adapter = args.adapterRef.current;
    if (!adapter) {
      return;
    }
    return adapter.onScroll((event) => {
      const activeKey = args.activeRestoreSelectionKeyRef.current;
      const activeStartedAt = activeRestoreStartedAtRef.current;
      if (
        !event.userInitiated ||
        !activeKey ||
        !args.isRestoreApplyingActiveRef.current ||
        activeStartedAt?.key !== activeKey ||
        Date.now() - activeStartedAt.startedAt < RESTORE_USER_SCROLL_INTERRUPT_GRACE_MS
      ) {
        return;
      }
      cancelActiveRestoreForUserScroll(args, activeKey);
    });
  }, [activeRestoreStartedAtRef, args]);
}

function cancelActiveRestoreForUserScroll(args: SelectionRestoreExecutionArgs, activeKey: string) {
  cancelRestoreCompletionTimers(args);
  args.isRestoreApplyingActiveRef.current = false;
  const commandId = args.activeRestoreCommandIdRef.current;
  args.activeRestoreCommandIdRef.current = null;
  args.activeRestoreSelectionKeyRef.current = null;
  args.lastRestoredSelectionKeyRef.current = activeKey;
  args.pendingRestoreSelectionKeyRef.current = null;
  if (commandId) {
    args.completeApplyingReadingPosition?.('editor-restore-selection-user-interrupted', undefined, commandId);
    return;
  }
  args.completeApplyingReadingPosition?.('editor-restore-selection-user-interrupted');
}

function cancelRestoreCompletionTimers(args: SelectionRestoreExecutionArgs) {
  if (args.restoreCompletionFrameRef.current !== null) {
    cancelAnimationFrame(args.restoreCompletionFrameRef.current);
    args.restoreCompletionFrameRef.current = null;
  }
  if (args.restoreCompletionFrame2Ref.current !== null) {
    cancelAnimationFrame(args.restoreCompletionFrame2Ref.current);
    args.restoreCompletionFrame2Ref.current = null;
  }
  if (args.restoreCompletionTimeoutRef.current !== null) {
    window.clearTimeout(args.restoreCompletionTimeoutRef.current);
    args.restoreCompletionTimeoutRef.current = null;
  }
}

function runSelectionRestore(args: Omit<SelectionRestoreExecutionArgs, 'adapterRef'> & {
  adapter: CodeMirrorEditorAdapter | null;
}) {
  const restoreTarget = resolveRestoreTarget({
    adapter: args.adapter,
    activeRestoreSelectionKey: args.activeRestoreSelectionKeyRef.current,
    activeRestoreValueLength: args.activeRestoreValueLengthRef.current,
    lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
    nodeId: args.nodeId,
    pendingRestoreSelectionKey: args.pendingRestoreSelectionKeyRef.current,
    readingRestoreCommandId: args.readingRestoreCommandId,
    readingRestoreScrollTop: args.readingRestoreScrollTop,
    readingSelection: args.readingSelection,
    readingSelectionMode: args.readingSelectionMode,
    readingTargetViewportMode: args.readingTargetViewportMode,
    readingTargetViewportRatio: args.readingTargetViewportRatio,
    value: args.value
  });
  handleSelectionRestore({
    activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
    nodeId: args.nodeId,
    pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
    readingRestoreCommandId: args.readingRestoreCommandId,
    readingRestoreScrollTop: args.readingRestoreScrollTop,
    readingSelection: args.readingSelection,
    readingSelectionMode: args.readingSelectionMode,
    readingTargetViewportMode: args.readingTargetViewportMode,
    readingTargetViewportRatio: args.readingTargetViewportRatio,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
    restoreTarget,
    shouldSuppressSelectionRestore: args.shouldSuppressSelectionRestore,
    valueLength: args.value.length
  });
}
