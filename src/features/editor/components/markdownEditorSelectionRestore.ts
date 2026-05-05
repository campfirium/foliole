import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import {
  clearRestoreCompletionTimers,
  handleSelectionRestore,
  resolveRestoreTarget
} from './markdownEditorSelectionRestoreSupport';
import type { EditorViewState } from './markdownEditorTypes';

export function useEditorSelectionRestore(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  nodeViewState: EditorViewState | undefined,
  beginApplyingReadingPosition: ((selection: EditorViewState['selection'], reason: string) => void) | undefined,
  completeApplyingReadingPosition: ((reason: string) => void) | undefined,
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined,
  shouldSuppressSelectionRestore: (() => boolean) | undefined,
  syncScrollMetrics: () => void,
  value: string
) {
  const activeRestoreSelectionKeyRef = useRef<string | null>(null);
  const lastRestoredSelectionKeyRef = useRef<string | null>(null);
  const pendingRestoreSelectionKeyRef = useRef<string | null>(null);
  const previousNodeIdRef = useRef<string | null>(null);
  const isRestoreApplyingActiveRef = useRef(false);
  const restoreCompletionFrameRef = useRef<number | null>(null);
  const restoreCompletionFrame2Ref = useRef<number | null>(null);
  const restoreCompletionTimeoutRef = useRef<number | null>(null);
  useRestoreCompletionCleanup(
    activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition,
    isRestoreApplyingActiveRef,
    restoreCompletionFrameRef,
    restoreCompletionFrame2Ref,
    restoreCompletionTimeoutRef
  );

  useLayoutEffect(() => {
    if (previousNodeIdRef.current === nodeId) {
      return;
    }
    previousNodeIdRef.current = nodeId;
    lastRestoredSelectionKeyRef.current = null;
    pendingRestoreSelectionKeyRef.current = createPendingRestoreSelectionKey(nodeId, readingSelection, nodeViewState);
  }, [nodeId]);

  useLayoutEffect(() => {
    runSelectionRestore({
      adapter: adapterRef.current,
      activeRestoreSelectionKeyRef,
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
      syncScrollMetrics,
      value
    });
  }, [
    activeRestoreSelectionKeyRef,
    adapterRef,
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    nodeId,
    nodeViewState,
    readingSelection,
    setReadingPositionSelection,
    shouldSuppressSelectionRestore,
    syncScrollMetrics,
    value
  ]);
}

function runSelectionRestore(args: {
  adapter: CodeMirrorEditorAdapter | null;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
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
  syncScrollMetrics: () => void;
  value: string;
}) {
  const restoreTarget = resolveRestoreTarget({
    adapter: args.adapter,
    activeRestoreSelectionKey: args.activeRestoreSelectionKeyRef.current,
    lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
    nodeId: args.nodeId,
    nodeViewState: args.nodeViewState,
    pendingRestoreSelectionKey: args.pendingRestoreSelectionKeyRef.current,
    readingSelection: args.readingSelection,
    value: args.value
  });
  handleSelectionRestore({
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
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
    syncScrollMetrics: args.syncScrollMetrics
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
