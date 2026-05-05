import { useEffect, useRef, type MutableRefObject } from 'react';

import { pushDebugTrace } from '../../shared/testing/debugBridge';

import {
  applyImmersiveEntrySelection,
  getCurrentApplyingSelection,
  isApplyingReadingPosition
} from './immersiveReadingApplying';
import {
  clearParagraphMarker,
  getViewportReadingSelection,
  syncParagraphMarkerToReadingPosition
} from './immersiveReadingMarker';
import {
  captureReadingSelection,
  commitReadingSelectionUpdate,
  resolveStoredReadingSelection,
  shouldIgnoreWhitespaceViewportSample
} from './immersiveReadingScrollSyncSupport';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function useImmersiveParagraphMarkerSync(props: WorkspaceLayoutProps, isImmersiveEditing: boolean) {
  useEffect(() => {
    if (!props.isImmersiveMode || isImmersiveEditing) {
      clearParagraphMarker(props.editorAdapterRef);
      return;
    }
    syncParagraphMarkerToReadingPosition(props);
  }, [isImmersiveEditing, props]);
}

export function useImmersiveScrollSync(
  getReadingSelection: () => { from: number; to: number },
  props: WorkspaceLayoutProps,
  isImmersiveEditing: boolean,
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void,
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>
) {
  const latestArgsRef = useRef({
    getReadingSelection,
    props,
    setReadingSelection
  });
  latestArgsRef.current = {
    getReadingSelection,
    props,
    setReadingSelection
  };
  const editor = props.editorAdapterRef.current;

  useEffect(() => {
    if (isImmersiveEditing) {
      shouldSkipNextScrollSyncRef.current = false;
      return;
    }
    if (!editor) {
      return;
    }
    const unsubscribe = editor.onScroll(() =>
      handleScrollSyncEvent(
        editor,
        latestArgsRef.current.getReadingSelection,
        latestArgsRef.current.props,
        latestArgsRef.current.setReadingSelection,
        shouldSkipNextScrollSyncRef
      )
    );
    return () => {
      unsubscribe();
    };
  }, [editor, isImmersiveEditing, shouldSkipNextScrollSyncRef]);
}

export function useImmersiveEntrySelectionSync(
  getReadingSelection: () => { from: number; to: number },
  getPendingSelection: () => { from: number; to: number } | null,
  clearPendingSelection: () => void,
  props: WorkspaceLayoutProps,
  isImmersiveEditing: boolean,
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>,
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void,
  wasImmersiveModeRef: MutableRefObject<boolean>
) {
  useEffect(() => {
    const changedImmersiveMode = props.isImmersiveMode !== wasImmersiveModeRef.current;
    wasImmersiveModeRef.current = props.isImmersiveMode;
    if (!changedImmersiveMode || isImmersiveEditing) {
      return;
    }
    const pendingSelection = getPendingSelection();
    if (!pendingSelection) {
      return;
    }
    let frameId = 0;
    let remainingAttempts = 10;

    const applySelection = () =>
      applyImmersiveEntrySelection({
        clearPendingSelection,
        props,
        remainingAttempts,
        scheduleRetry: () => {
          remainingAttempts -= 1;
          frameId = window.requestAnimationFrame(applySelection);
        },
        selection: pendingSelection,
        setReadingSelection,
        shouldSkipNextScrollSyncRef
      });

    applySelection();
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    clearPendingSelection,
    getPendingSelection,
    getReadingSelection,
    isImmersiveEditing,
    props,
    shouldSkipNextScrollSyncRef,
    setReadingSelection,
    wasImmersiveModeRef
  ]);
}

function handleScrollSyncEvent(
  editor: NonNullable<WorkspaceLayoutProps['editorAdapterRef']['current']>,
  getReadingSelection: () => { from: number; to: number },
  props: WorkspaceLayoutProps,
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void,
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>
) {
  if (isApplyingReadingPosition(props)) {
    pushDebugTrace('immersive.scroll-sync.ignored-applying', {
      isImmersiveMode: props.isImmersiveMode,
      selection: getCurrentApplyingSelection(props)
    });
    return;
  }
  if (shouldSkipNextScrollSyncRef.current) {
    shouldSkipNextScrollSyncRef.current = false;
    return;
  }
  syncViewportReadingSelection(editor, getReadingSelection, props, setReadingSelection);
}

function syncViewportReadingSelection(
  editor: NonNullable<WorkspaceLayoutProps['editorAdapterRef']['current']>,
  getReadingSelection: () => { from: number; to: number },
  props: WorkspaceLayoutProps,
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void
) {
  const selection = getViewportReadingSelection(props);
  if (!selection) {
    pushDebugTrace('immersive.scroll-sync.skip-missing-selection', {
      isImmersiveMode: props.isImmersiveMode
    });
    return;
  }
  const previousSelection = getReadingSelection();
  if (!props.isImmersiveMode || (previousSelection.from === selection.from && previousSelection.to === selection.to)) {
    return;
  }
  if (shouldIgnoreWhitespaceViewportSample(editor, selection)) {
    pushDebugTrace('immersive.scroll-sync.ignored-whitespace-sample', {
      isImmersiveMode: props.isImmersiveMode,
      selection
    });
    return;
  }
  setReadingSelection(selection, 'scroll-sync');
  pushDebugTrace('immersive.scroll-sync.selection-updated', {
    isImmersiveMode: props.isImmersiveMode,
    previousSelection,
    selection
  });
  editor.setSelection(selection);
  syncParagraphMarkerToReadingPosition(props);
}

export function useReadingSelectionState(
  props: WorkspaceLayoutProps
) {
  const readingSelectionRef = useRef(resolveStoredReadingSelection(props));
  const pendingSelectionRef = useRef<{ from: number; to: number } | null>(null);
  useEffect(() => {
    readingSelectionRef.current = resolveStoredReadingSelection(props);
  }, [
    props.activeNodeId,
    props.editorAdapterRef,
    props.editorNodeViewState?.selection.from,
    props.editorNodeViewState?.selection.to,
    props.getReadingPositionSelection,
    props.getReadingPositionSyncState,
    props.setReadingPositionSelection
  ]);

  return {
    captureReadingSelectionFromViewport: () =>
      captureReadingSelection({
        pendingSelectionRef,
        props,
        readingSelectionRef
      }),
    clearPendingSelection: () => {
      pendingSelectionRef.current = null;
    },
    getPendingSelection: () => pendingSelectionRef.current,
    getReadingSelection: () => readingSelectionRef.current,
    queueReadingSelectionRestore: () => {
      pendingSelectionRef.current = readingSelectionRef.current;
    },
    setReadingSelection: (selection: { from: number; to: number }, source = 'unspecified') =>
      commitReadingSelectionUpdate({
        props,
        readingSelectionRef,
        selection,
        source
      })
  };
}
