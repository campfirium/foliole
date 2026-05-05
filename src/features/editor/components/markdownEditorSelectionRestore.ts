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
  const lastRestoredSelectionKeyRef = useRef<string | null>(null);
  const isRestoreApplyingActiveRef = useRef(false);
  const restoreCompletionFrameRef = useRef<number | null>(null);
  const restoreCompletionFrame2Ref = useRef<number | null>(null);
  const restoreCompletionTimeoutRef = useRef<number | null>(null);
  useRestoreCompletionCleanup(
    completeApplyingReadingPosition,
    isRestoreApplyingActiveRef,
    restoreCompletionFrameRef,
    restoreCompletionFrame2Ref,
    restoreCompletionTimeoutRef
  );

  useLayoutEffect(() => {
    runSelectionRestore({
      adapter: adapterRef.current,
      beginApplyingReadingPosition,
      completeApplyingReadingPosition,
      isRestoreApplyingActiveRef,
      lastRestoredSelectionKeyRef,
      nodeId,
      nodeViewState,
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
    adapterRef,
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    nodeId,
    nodeViewState?.selection,
    readingSelection,
    setReadingPositionSelection,
    shouldSuppressSelectionRestore,
    syncScrollMetrics,
    value
  ]);
}

function runSelectionRestore(args: {
  adapter: CodeMirrorEditorAdapter | null;
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
  setReadingPositionSelection: ((selection: EditorViewState['selection']) => void) | undefined;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  syncScrollMetrics: () => void;
  value: string;
}) {
  const restoreTarget = resolveRestoreTarget({
    adapter: args.adapter,
    lastRestoredSelectionKey: args.lastRestoredSelectionKeyRef.current,
    nodeId: args.nodeId,
    nodeViewState: args.nodeViewState,
    readingSelection: args.readingSelection,
    value: args.value
  });
  handleSelectionRestore({
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
    nodeId: args.nodeId,
    nodeViewState: args.nodeViewState,
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
  completeApplyingReadingPosition: ((reason: string) => void) | undefined,
  isRestoreApplyingActiveRef: MutableRefObject<boolean>,
  restoreCompletionFrameRef: MutableRefObject<number | null>,
  restoreCompletionFrame2Ref: MutableRefObject<number | null>,
  restoreCompletionTimeoutRef: MutableRefObject<number | null>
) {
  useEffect(
    () => () =>
      clearRestoreCompletionTimers({
        completeApplyingReadingPosition,
        isRestoreApplyingActiveRef,
        restoreCompletionFrame2Ref,
        restoreCompletionFrameRef,
        restoreCompletionTimeoutRef
      }),
    [completeApplyingReadingPosition, isRestoreApplyingActiveRef, restoreCompletionFrame2Ref, restoreCompletionFrameRef, restoreCompletionTimeoutRef]
  );
}
