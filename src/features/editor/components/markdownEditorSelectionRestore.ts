import { useRef, type MutableRefObject } from 'react';

import type { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorViewportMode } from '../adapters/EditorAdapter';

import { useSelectionRestoreExecution } from './markdownEditorSelectionRestoreExecution';
import {
  usePendingRestoreKey,
  useRestoreCompletionCleanup
} from './markdownEditorSelectionRestoreHooks';
import type { EditorViewState } from './markdownEditorTypes';

function useSelectionRestoreRefs() {
  return {
    activeRestoreCommandIdRef: useRef<string | null>(null),
    activeRestoreSelectionKeyRef: useRef<string | null>(null),
    activeRestoreValueLengthRef: useRef(0),
    isRestoreApplyingActiveRef: useRef(false),
    lastRestoredSelectionKeyRef: useRef<string | null>(null),
    pendingRestoreSelectionKeyRef: useRef<string | null>(null),
    restoreCompletionFrame2Ref: useRef<number | null>(null),
    restoreCompletionFrameRef: useRef<number | null>(null),
    restoreCompletionTimeoutRef: useRef<number | null>(null)
  };
}

export type SelectionRestoreRefs = ReturnType<typeof useSelectionRestoreRefs>;

export function useEditorSelectionRestoreRefs() {
  return useSelectionRestoreRefs();
}

export function useEditorSelectionRestorePreparation(args: {
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string, commandId?: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>, commandId?: string) => void) | undefined;
  nodeId: string | null;
  readingRestoreCommandId: string | null | undefined;
  readingRestoreScrollTop: number | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  restoreRefs: SelectionRestoreRefs;
}) {
  useSelectionRestorePreparation({
    activeRestoreCommandIdRef: args.restoreRefs.activeRestoreCommandIdRef,
    activeRestoreSelectionKeyRef: args.restoreRefs.activeRestoreSelectionKeyRef,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.restoreRefs.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.restoreRefs.lastRestoredSelectionKeyRef,
    nodeId: args.nodeId,
    pendingRestoreSelectionKeyRef: args.restoreRefs.pendingRestoreSelectionKeyRef,
    readingRestoreCommandId: args.readingRestoreCommandId,
    readingRestoreScrollTop: args.readingRestoreScrollTop,
    readingSelection: args.readingSelection,
    readingTargetViewportMode: args.readingTargetViewportMode,
    restoreCompletionFrame2Ref: args.restoreRefs.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreRefs.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreRefs.restoreCompletionTimeoutRef
  });
}

export function useEditorSelectionRestoreExecution(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
  beginApplyingReadingPosition: ((selection: NonNullable<EditorViewState['selection']>, reason: string, commandId?: string) => void) | undefined;
  completeApplyingReadingPosition: ((reason: string, selection?: NonNullable<EditorViewState['selection']>, commandId?: string) => void) | undefined;
  nodeId: string | null;
  readingRestoreCommandId: string | null | undefined;
  readingRestoreScrollTop: number | undefined;
  readingSelection: EditorViewState['selection'] | null | undefined;
  readingTargetViewportMode: EditorViewportMode | null | undefined;
  readingTargetViewportRatio: number | null | undefined;
  restoreRefs: SelectionRestoreRefs;
  shouldSuppressSelectionRestore: (() => boolean) | undefined;
  value: string;
}) {
  useSelectionRestoreExecution({
    adapterRef: args.adapterRef,
    activeRestoreCommandIdRef: args.restoreRefs.activeRestoreCommandIdRef,
    activeRestoreSelectionKeyRef: args.restoreRefs.activeRestoreSelectionKeyRef,
    activeRestoreValueLengthRef: args.restoreRefs.activeRestoreValueLengthRef,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.restoreRefs.isRestoreApplyingActiveRef,
    lastRestoredSelectionKeyRef: args.restoreRefs.lastRestoredSelectionKeyRef,
    nodeId: args.nodeId,
    pendingRestoreSelectionKeyRef: args.restoreRefs.pendingRestoreSelectionKeyRef,
    readingRestoreCommandId: args.readingRestoreCommandId,
    readingRestoreScrollTop: args.readingRestoreScrollTop,
    readingSelection: args.readingSelection,
    readingTargetViewportMode: args.readingTargetViewportMode,
    readingTargetViewportRatio: args.readingTargetViewportRatio,
    restoreCompletionFrame2Ref: args.restoreRefs.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreRefs.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreRefs.restoreCompletionTimeoutRef,
    shouldSuppressSelectionRestore: args.shouldSuppressSelectionRestore,
    value: args.value
  });
}

function useSelectionRestorePreparation(args: {
  activeRestoreCommandIdRef: MutableRefObject<string | null>;
  activeRestoreSelectionKeyRef: MutableRefObject<string | null>;
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
  restoreCompletionFrame2Ref: MutableRefObject<number | null>;
  restoreCompletionFrameRef: MutableRefObject<number | null>;
  restoreCompletionTimeoutRef: MutableRefObject<number | null>;
}) {
  useRestoreCompletionCleanup({
    activeRestoreCommandIdRef: args.activeRestoreCommandIdRef,
    activeRestoreSelectionKeyRef: args.activeRestoreSelectionKeyRef,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    isRestoreApplyingActiveRef: args.isRestoreApplyingActiveRef,
    restoreCompletionFrame2Ref: args.restoreCompletionFrame2Ref,
    restoreCompletionFrameRef: args.restoreCompletionFrameRef,
    restoreCompletionTimeoutRef: args.restoreCompletionTimeoutRef
  });
  usePendingRestoreKey({
    lastRestoredSelectionKeyRef: args.lastRestoredSelectionKeyRef,
    nodeId: args.nodeId,
    pendingRestoreSelectionKeyRef: args.pendingRestoreSelectionKeyRef,
    readingRestoreCommandId: args.readingRestoreCommandId,
    readingRestoreScrollTop: args.readingRestoreScrollTop,
    readingSelection: args.readingSelection,
    readingTargetViewportMode: args.readingTargetViewportMode
  });
}
