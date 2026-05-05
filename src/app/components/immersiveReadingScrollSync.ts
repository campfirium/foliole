import { useEffect, useRef, type MutableRefObject } from 'react';

import { pushDebugTrace } from '../../shared/testing/debugBridge';

import {
  applyImmersiveEntrySelection,
  getCurrentApplyingSelection,
  isApplyingReadingPosition
} from './immersiveReadingApplying';
import {
  clearParagraphMarker,
  getReadingPositionSelection,
  getViewportReadingSelection,
  syncParagraphMarkerToReadingPosition
} from './immersiveReadingMarker';
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
  useEffect(() => {
    if (isImmersiveEditing) {
      shouldSkipNextScrollSyncRef.current = false;
      return;
    }
    const editor = props.editorAdapterRef.current;
    if (!editor) {
      return;
    }
    const unsubscribe = editor.onScroll(() =>
      handleScrollSyncEvent(editor, getReadingSelection, props, setReadingSelection, shouldSkipNextScrollSyncRef)
    );
    return () => {
      unsubscribe();
    };
  }, [getReadingSelection, isImmersiveEditing, props, setReadingSelection, shouldSkipNextScrollSyncRef]);
}

function resolveStoredReadingSelection(props: WorkspaceLayoutProps) {
  const applyingSelection = getCurrentApplyingSelection(props);
  if (applyingSelection) {
    return applyingSelection;
  }
  const runtimeSelection = props.getReadingPositionSelection();
  if (runtimeSelection) {
    return runtimeSelection;
  }
  const editor = props.editorAdapterRef.current;
  if (!editor) {
    return getReadingPositionSelection(props, { from: 0, to: 0 });
  }
  return getReadingPositionSelection(props, editor.getSelection());
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
  setReadingSelection(selection, 'scroll-sync');
  pushDebugTrace('immersive.scroll-sync.selection-updated', {
    isImmersiveMode: props.isImmersiveMode,
    previousSelection,
    selection
  });
  if (!props.isImmersiveMode || (previousSelection.from === selection.from && previousSelection.to === selection.to)) {
    return;
  }
  editor.setSelection(selection);
  syncParagraphMarkerToReadingPosition(props);
}

function commitReadingSelectionUpdate(args: {
  props: WorkspaceLayoutProps;
  readingSelectionRef: MutableRefObject<{ from: number; to: number }>;
  selection: { from: number; to: number };
  source: string;
}) {
  const applyingSelection = getCurrentApplyingSelection(args.props);
  if (
    applyingSelection &&
    (applyingSelection.from !== args.selection.from || applyingSelection.to !== args.selection.to)
  ) {
    pushDebugTrace('immersive.reading-selection.rejected-applying', {
      activeNodeId: args.props.activeNodeId,
      selection: args.selection,
      source: args.source,
      targetSelection: applyingSelection
    });
    return false;
  }
  args.readingSelectionRef.current = args.selection;
  args.props.setReadingPositionSelection(args.selection);
  pushDebugTrace('immersive.reading-selection.updated', {
    activeNodeId: args.props.activeNodeId,
    selection: args.selection,
    source: args.source
  });
  return true;
}

function captureReadingSelection(args: {
  pendingSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  props: WorkspaceLayoutProps;
  readingSelectionRef: MutableRefObject<{ from: number; to: number }>;
}) {
  const selection = getViewportReadingSelection(args.props);
  if (!selection) {
    pushDebugTrace('immersive.capture-selection.skip-missing-selection', {
      activeNodeId: args.props.activeNodeId
    });
    return;
  }
  commitReadingSelectionUpdate({
    props: args.props,
    readingSelectionRef: args.readingSelectionRef,
    selection,
    source: 'capture-viewport'
  });
  args.pendingSelectionRef.current = selection;
  pushDebugTrace('immersive.capture-selection.updated', {
    activeNodeId: args.props.activeNodeId,
    selection
  });
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
