import { useLayoutEffect, useRef, type MutableRefObject } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';

import {
  usePendingRestoreKey,
  useRestoreCompletionCleanup
} from './markdownEditorSelectionRestoreHooks';
import {
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
    previousReadingSelectionRef: useRef<EditorViewState['selection'] | null | undefined>(undefined),
    restoreCompletionFrame2Ref: useRef<number | null>(null),
    restoreCompletionFrameRef: useRef<number | null>(null),
    restoreCompletionTimeoutRef: useRef<number | null>(null)
  };
}

function useSelectionRestoreExecution(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
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
      readingTargetViewportMode: args.readingTargetViewportMode,
      readingTargetViewportRatio: args.readingTargetViewportRatio,
      restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
      restoreCompletionFrameRef: args.restoreCompletionFrameRef,
      restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef,
      shouldSuppressSelectionRestore: args.shouldSuppressSelectionRestore,
      value: args.value
    });
  }, [args]);
}

export function useEditorSelectionRestore(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  nodeId: string | null,
  readingSelection: EditorViewState['selection'] | null | undefined,
  readingTargetViewportMode: EditorViewportMode | null | undefined,
  readingTargetViewportRatio: number | null | undefined,
  nodeViewState: EditorViewState | undefined,
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string) => void) | undefined,
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined,
  _setReadingPositionSelection: ((selection: NonNullable<EditorViewState['selection']>) => void) | undefined,
  shouldSuppressSelectionRestore: (() => boolean) | undefined,
  value: string
) {
  const restoreRefs = useSelectionRestoreRefs();
  useSelectionRestorePreparation({
    activeRestoreSelectionKeyRef: restoreRefs.activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: restoreRefs.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: restoreRefs.lastRestoredSelectionKeyRef,
    nodeId,
    nodeViewState,
    pendingRestoreSelectionKeyRef: restoreRefs.pendingRestoreSelectionKeyRef,
    previousNodeIdRef: restoreRefs.previousNodeIdRef,
    previousReadingSelectionRef: restoreRefs.previousReadingSelectionRef,
    readingSelection,
    readingTargetViewportMode,
    restoreCompletionFrame2Ref: restoreRefs.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: restoreRefs.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: restoreRefs.restoreCompletionTimeoutRef
  });
  useSelectionRestoreExecution({
    adapterRef,
    activeRestoreSelectionKeyRef: restoreRefs.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: restoreRefs.activeRestoreValueLengthRef,
    beginApplyingReadingPosition,
    completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: restoreRefs.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: restoreRefs.lastRestoredSelectionKeyRef,
    nodeId,
    nodeViewState,
    pendingRestoreSelectionKeyRef: restoreRefs.pendingRestoreSelectionKeyRef,
    readingSelection,
    readingTargetViewportMode,
    readingTargetViewportRatio,
    restoreCompletionFrame2Ref: restoreRefs.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: restoreRefs.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: restoreRefs.restoreCompletionTimeoutRef,
    shouldSuppressSelectionRestore,
    value
  });
}

function useSelectionRestorePreparation(args: {
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>) => void) | undefined;
  isRestoreApplyingActiveRef: MutableRefObject<boolean>;
  lastRestoredSelectionKeyRef: MutableRefObject<string | null>;
  nodeId: string | null;
  nodeViewState: EditorViewState | undefined;
  pendingRestoreSelectionKeyRef: MutableRefObject<string | null>;
  previousNodeIdRef: MutableRefObject<string | null>;
  previousReadingSelectionRef: MutableRefObject<EditorViewState['selection'] | null | undefined>;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  useRestoreCompletionCleanup({
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
  });
  usePendingRestoreKey({
    ...args,
    readingTargetViewportMode: args.readingTargetViewportMode
  });
}

function runSelectionRestore(args: {
  adapter: CodeMirrorEditorAdapter | null;
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
    readingTargetViewportMode: args.readingTargetViewportMode,
    readingTargetViewportRatio: args.readingTargetViewportRatio,
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
