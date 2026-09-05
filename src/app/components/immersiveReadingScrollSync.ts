import { useEffect, useRef, type MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ReadingPositionSyncState } from '../hooks/useAppRuntime';

import { applyImmersiveEntrySelection } from './immersiveReadingApplying';
import { clearParagraphMarker, syncParagraphMarkerToReadingPosition } from './immersiveReadingMarker';
import {
  captureReadingSelection,
  commitReadingSelectionUpdate,
  handleImmersiveScrollSyncEvent,
  resolveStoredReadingSelection
} from './immersiveReadingScrollSyncSupport';

interface ImmersiveScrollSyncSource {
  activeNodeId: string | null;
  completeApplyingReadingPosition: (reason: string, selection?: EditorSelection) => void;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  editorNodeViewState?: NodeViewState | undefined;
  getReadingPositionSelection: () => EditorSelection | null;
  getReadingPositionSyncState: () => ReadingPositionSyncState | null;
  isImmersiveMode: boolean;
  setReadingPositionSelection: (selection: EditorSelection) => void;
}

export function useImmersiveParagraphMarkerSync(
  props: Pick<
    ImmersiveScrollSyncSource,
    'activeNodeId' | 'editorAdapterRef' | 'editorNodeViewState' | 'getReadingPositionSelection' | 'isImmersiveMode'
  >,
  isImmersiveEditing: boolean
) {
  useEffect(() => {
    if (!props.isImmersiveMode || isImmersiveEditing) {
      clearParagraphMarker(props.editorAdapterRef);
      return;
    }
    syncParagraphMarkerToReadingPosition(props);
  }, [isImmersiveEditing, props]);
}

export function useImmersiveScrollSync(
  getReadingSelection: () => { from: number; to: number } | null,
  props: ImmersiveScrollSyncSource,
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
    const unsubscribe = editor.onScroll((event) =>
      handleImmersiveScrollSyncEvent({
        editor,
        event,
        getReadingSelection: latestArgsRef.current.getReadingSelection,
        props: latestArgsRef.current.props,
        setReadingSelection: latestArgsRef.current.setReadingSelection,
        shouldSkipNextScrollSyncRef
      })
    );
    return () => {
      unsubscribe();
    };
  }, [editor, isImmersiveEditing, shouldSkipNextScrollSyncRef]);
}

export function useImmersiveEntrySelectionSync(
  getReadingSelection: () => { from: number; to: number } | null,
  getPendingSelection: () => { from: number; to: number } | null,
  clearPendingSelection: () => void,
  props: ImmersiveScrollSyncSource,
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

export function useReadingSelectionState(
  props: Pick<
    ImmersiveScrollSyncSource,
    | 'activeNodeId'
    | 'editorAdapterRef'
    | 'editorNodeViewState'
    | 'getReadingPositionSelection'
    | 'getReadingPositionSyncState'
    | 'setReadingPositionSelection'
  >
) {
  const readingSelectionRef = useRef(resolveStoredReadingSelection(props));
  const pendingSelectionRef = useRef<{ from: number; to: number } | null>(null);
  useEffect(() => {
    readingSelectionRef.current = resolveStoredReadingSelection(props);
  }, [
    props.activeNodeId,
    props.editorAdapterRef,
    props.editorNodeViewState?.selection?.from,
    props.editorNodeViewState?.selection?.to,
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
