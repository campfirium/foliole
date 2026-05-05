import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import {
  clearRestoreCompletionTimers,
  handleSelectionRestore,
  resolveRestoreTarget
} from './markdownEditorSelectionRestoreSupport';
import type { EditorViewState } from './markdownEditorTypes';

function useSelectionRestoreRefs() {
  return {
    activeRestoreSelectionKeyRef: useRef<string | null>(null),
    activeRestoreValueLengthRef: useRef(0),
    isRestoreApplyingActiveRef: useRef(false),
    lastRestoredSelectionKeyRef: useRef<string | null>(null),
    pendingRestoreSelectionKeyRef: useRef<string | null>(null),
    previousNodeIdRef: useRef<string | null>(null),
    restoreCompletionFrame2Ref: useRef<number | null>(null),
    restoreCompletionFrameRef: useRef<number | null>(null),
    restoreCompletionTimeoutRef: useRef<number | null>(null)
  };
}

function usePendingRestoreKey(args: {
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  previousNodeIdRef: MutableRefObject<string | null>;
  readingSelection: EditorViewState['selection'] | null | undefined;
}) {
  useLayoutEffect(() => {
    if (args.previousNodeIdRef.current === args.nodeId) {
      return;
    }
    args.previousNodeIdRef.current = args.nodeId;
    args.lastRestoredSelectionKeyRef.current = null;
    args.pendingRestoreSelectionKeyRef.current = createPendingRestoreSelectionKey(
      args.nodeId,
      args.readingSelection,
      args.nodeViewState
    );
  }, [args]);
}

function useSelectionRestoreExecution(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
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
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  value: string;
}) {
  useLayoutEffect(() => {
    runSelectionRestore({
      adapter: args.adapterRef.current,
      activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
      activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
      beginApplyingReadingPosition: args.beginApplyingReadingPosition,
      completeApplyingReadingPosition: args.completeApplyingReadingPosition,
      isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
      lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
      nodeId: args.nodeId,
      nodeViewState: args.nodeViewState,
      pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
      readingSelection: args.readingSelection,
      restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
      restoreCompletionFrameRef: args.restoreCompletionFrameRef,
      restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
      setReadingPositionSelection: args.setReadingPositionSelection,
      shouldSuppressSelectionRestore: args.shouldSuppressSelectionRestore,
      value: args.value
    });
  }, [args]);
}

export function useEditorSelectionRestore(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined,
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined,
  completeApplyingReadingPosition: ((reason: string) => void) | undefined,
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined,
  shouldSuppressSelectionRestore: (() => boolean) | undefined,
  value: string
) {
  const {
    activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef,
    isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef,
    pendingRestoreSelectionKeyRef,
    previousNodeIdRef,
    restoreCompletionFrame2Ref,
    restoreCompletionFrameRef,
    restoreCompletionTimeoutRef
  } = useSelectionRestoreRefs();
  useRestoreCompletionCleanup(
    activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition,
    isRestoreApplyingActiveRef,
    restoreCompletionFrameRef,
    restoreCompletionFrame2Ref,
    restoreCompletionTimeoutRef
  );
  usePendingRestoreKey({
    lastRestoredSelectionKeyRef,
    nodeId,
    nodeViewState,
    pendingRestoreSelectionKeyRef,
    previousNodeIdRef,
    readingSelection
  });
  useSelectionRestoreExecution({
    adapterRef,
    activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef,
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef,
    nodeId,
    nodeViewState,
    pendingRestoreSelectionKeyRef,
    readingSelection,
    restoreCompletionFrame2Ref,
    restoreCompletionFrameRef,
    restoreCompletionTimeoutRef,
    setReadingPositionSelection,
    shouldSuppressSelectionRestore,
    value
  });
}

function runSelectionRestore(args: {
  adapter: CodeMirrorEditorAdapter | null;
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
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  value: string;
}) {
  const restoreTarget = resolveRestoreTarget({
    adapter: args.adapter,
    activeRestoreSelectionKey: args.activeRestoreSelectionKeyRef.current,
    activeRestoreValueLength: args.activeRestoreValueLengthRef.current,
    lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
    nodeId: args.nodeId,
    nodeViewState: args.nodeViewState,
    pendingRestoreSelectionKey: args.pendingRestoreSelectionKeyRef.current,
    readingSelection: args.readingSelection,
    value: args.value
  });
  handleSelectionRestore({
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.activeRestoreValueLengthRef,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
    nodeId: args.nodeId,
    nodeViewState: args.nodeViewState,
    pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
    readingSelection: args.readingSelection,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
    restoreTarget,
    setReadingPositionSelection: args.setReadingPositionSelection,
    shouldSuppressSelectionRestore: args.shouldSuppressSelectionRestore,
    valueLength: args.value.length
  });
}

function useRestoreCompletionCleanup(
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>,
  completeApplyingReadingPosition: ((reason: string) => void) | undefined,
  isRestoreApplyingActiveRef: MutableRefObject<boolean>,
  restoreCompletionFrameRef: MutableRefObject<number | null>,
  restoreCompletionFrame2Ref: MutableRefObject<number | null>,
  restoreCompletionTimeoutRef: MutableRefObject<number | null>
) {
  useEffect(
    () => () =>
      clearRestoreCompletionTimers({
        activeRestoreSelectionKeyRef,
        completeApplyingReadingPosition,
        isRestoreApplyingActiveRef,
        restoreCompletionFrame2Ref,
        restoreCompletionFrameRef,
        restoreCompletionTimeoutRef
      }),
    [
      activeRestoreSelectionKeyRef,
      completeApplyingReadingPosition,
      isRestoreApplyingActiveRef,
      restoreCompletionFrame2Ref,
      restoreCompletionFrameRef,
      restoreCompletionTimeoutRef
    ]
  );
}

function createPendingRestoreSelectionKey(
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined
) {
  const selection = readingSelection ?? nodeViewState?.selection;
  if (!nodeId || !selection) {
    return null;
  }
  return `${nodeId}:${selection.from}:${selection.to}:${nodeViewState?.scrollTop ?? 0}`;
}
