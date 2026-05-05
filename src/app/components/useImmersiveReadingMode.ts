import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { onWindowKeydown } from '../../shared/platform/keyboard';

import { handleImmersiveKeydown } from './immersiveReadingKeydown';
import {
  clearParagraphMarker,
  focusImmersiveEditor
} from './immersiveReadingMarker';
import type { ImmersiveReadingModeSource } from './immersiveReadingModeTypes';
import { getReadableNodeIds } from './immersiveReadingNodes';
import {
  useImmersiveEntrySelectionSync,
  useImmersiveParagraphMarkerSync,
  useImmersiveScrollSync,
  useReadingSelectionState
} from './immersiveReadingScrollSync';

function useImmersiveLifecycleReset(
  props: Pick<
    ImmersiveReadingModeSource,
    'activeNodeId' | 'editorAdapterRef' | 'isImmersiveMode' | 'isStudyMode' | 'onExitImmersiveMode'
  >,
  setIsImmersiveEditing: (value: boolean) => void,
  setIsShortcutsOverlayOpen: (value: boolean) => void,
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>,
  exitImmersiveModeRef: MutableRefObject<ImmersiveReadingModeSource['onExitImmersiveMode']>
) {
  useEffect(() => {
    exitImmersiveModeRef.current = props.onExitImmersiveMode;
  }, [props.onExitImmersiveMode]);

  useEffect(() => {
    if (!props.isImmersiveMode) {
      clearParagraphMarker(props.editorAdapterRef);
      setIsImmersiveEditing(false);
      setIsShortcutsOverlayOpen(false);
      return;
    }
    if (props.isStudyMode) {
      clearParagraphMarker(props.editorAdapterRef);
      exitImmersiveModeRef.current();
      return;
    }
    clearParagraphMarker(props.editorAdapterRef);
    shouldSkipNextScrollSyncRef.current = false;
    setIsImmersiveEditing(false);
    setIsShortcutsOverlayOpen(false);
  }, [
    props.activeNodeId,
    props.editorAdapterRef,
    props.isImmersiveMode,
    props.isStudyMode,
    setIsImmersiveEditing,
    setIsShortcutsOverlayOpen,
    shouldSkipNextScrollSyncRef
  ]);
}

function useImmersiveKeyboardHandler(args: {
  canToggleImmersiveMode: boolean;
  captureReadingSelectionFromViewport: () => void;
  getReadingSelection: () => { from: number; to: number } | null;
  isImmersiveEditing: boolean;
  markNextProgrammaticScroll: () => void;
  props: ImmersiveReadingModeSource;
  queueReadingSelectionRestore: () => void;
  readableNodeIds: string[];
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  suppressNextSelectionRestore: () => void;
}) {
  useEffect(
    () =>
      onWindowKeydown((event) =>
        handleImmersiveKeydown({
          canToggleImmersiveMode: args.canToggleImmersiveMode,
          captureReadingSelectionFromViewport: args.captureReadingSelectionFromViewport,
          event,
          getReadingSelection: args.getReadingSelection,
          isImmersiveEditing: args.isImmersiveEditing,
          markNextProgrammaticScroll: args.markNextProgrammaticScroll,
          props: args.props,
          queueReadingSelectionRestore: args.queueReadingSelectionRestore,
          readableNodeIds: args.readableNodeIds,
          setIsImmersiveEditing: args.setIsImmersiveEditing,
          setIsShortcutsOverlayOpen: args.setIsShortcutsOverlayOpen,
          setReadingSelection: args.setReadingSelection,
          suppressNextSelectionRestore: args.suppressNextSelectionRestore
        })
      ),
    [
      args.canToggleImmersiveMode,
      args.captureReadingSelectionFromViewport,
      args.getReadingSelection,
      args.isImmersiveEditing,
      args.markNextProgrammaticScroll,
      args.props,
      args.queueReadingSelectionRestore,
      args.readableNodeIds,
      args.setIsImmersiveEditing,
      args.setIsShortcutsOverlayOpen,
      args.setReadingSelection,
      args.suppressNextSelectionRestore
    ]
  );
}

function useImmersiveReadingSelectionSyncState(props: ImmersiveReadingModeSource) {
  return useReadingSelectionState(props);
}

function useImmersiveModeDependencies(props: ImmersiveReadingModeSource) {
  const selectionState = useImmersiveReadingSelectionSyncState(props);
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  return {
    ...selectionState,
    canToggleImmersiveMode:
      Boolean(props.activeNodeId && activeNode && activeNode.kind !== 'folder' && !props.trashedNodeIds.includes(props.activeNodeId)) &&
      !props.isStudyMode
  };
}

function useImmersiveReadingPositionSync(args: {
  clearPendingSelection: () => void;
  getPendingSelection: () => { from: number; to: number } | null;
  getReadingSelection: () => { from: number; to: number } | null;
  isImmersiveEditing: boolean;
  props: ImmersiveReadingModeSource;
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>;
  wasImmersiveModeRef: MutableRefObject<boolean>;
}) {
  useImmersiveEntrySelectionSync(
    args.getReadingSelection,
    args.getPendingSelection,
    args.clearPendingSelection,
    args.props,
    args.isImmersiveEditing,
    args.shouldSkipNextScrollSyncRef,
    args.setReadingSelection,
    args.wasImmersiveModeRef
  );
  useImmersiveParagraphMarkerSync(args.props, args.isImmersiveEditing);
  useImmersiveScrollSync(
    args.getReadingSelection,
    args.props,
    args.isImmersiveEditing,
    args.setReadingSelection,
    args.shouldSkipNextScrollSyncRef
  );
}

function useSelectionRestoreSuppression(props: Pick<ImmersiveReadingModeSource, 'isImmersiveMode'>) {
  const shouldSuppressSelectionRestoreRef = useRef(false);
  useEffect(() => {
    shouldSuppressSelectionRestoreRef.current = false;
  }, [props.isImmersiveMode]);
  return {
    shouldSuppressSelectionRestore: () => shouldSuppressSelectionRestoreRef.current,
    suppressNextSelectionRestore: () => {
      shouldSuppressSelectionRestoreRef.current = true;
    }
  };
}

function useImmersiveEditingFocusEffect(
  editorAdapterRef: ImmersiveReadingModeSource['editorAdapterRef'],
  isImmersiveEditing: boolean,
  isImmersiveMode: boolean
) {
  useEffect(() => {
    if (!isImmersiveMode || !isImmersiveEditing) {
      return;
    }
    clearParagraphMarker(editorAdapterRef);
    focusImmersiveEditor(editorAdapterRef);
  }, [editorAdapterRef, isImmersiveEditing, isImmersiveMode]);
}

export function useImmersiveReadingMode(props: ImmersiveReadingModeSource) {
  const [isImmersiveEditing, setIsImmersiveEditing] = useState(false);
  const [isShortcutsOverlayOpen, setIsShortcutsOverlayOpen] = useState(false);
  const exitImmersiveModeRef = useRef(props.onExitImmersiveMode);
  const shouldSkipNextScrollSyncRef = useRef(false);
  const wasImmersiveModeRef = useRef(props.isImmersiveMode);
  const selectionRestoreSuppression = useSelectionRestoreSuppression(props);
  const readableNodeIds = useMemo(
    () =>
      props.isImmersiveMode
        ? getReadableNodeIds(props.nodeOrder, props.nodesById, props.trashedNodeIds)
        : [],
    [props.isImmersiveMode, props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );
  const {
    canToggleImmersiveMode,
    captureReadingSelectionFromViewport,
    clearPendingSelection,
    getPendingSelection,
    getReadingSelection,
    queueReadingSelectionRestore,
    setReadingSelection
  } = useImmersiveModeDependencies(props);
  useImmersiveLifecycleReset(props, setIsImmersiveEditing, setIsShortcutsOverlayOpen, shouldSkipNextScrollSyncRef, exitImmersiveModeRef);
  useImmersiveReadingPositionSync({
    clearPendingSelection,
    getPendingSelection,
    getReadingSelection,
    isImmersiveEditing,
    props,
    setReadingSelection,
    shouldSkipNextScrollSyncRef,
    wasImmersiveModeRef
  });
  useImmersiveEditingFocusEffect(props.editorAdapterRef, isImmersiveEditing, props.isImmersiveMode);
  useImmersiveKeyboardHandler({
    canToggleImmersiveMode,
    captureReadingSelectionFromViewport,
    getReadingSelection,
    isImmersiveEditing,
    markNextProgrammaticScroll: () => {
      shouldSkipNextScrollSyncRef.current = true;
    },
    props,
    queueReadingSelectionRestore,
    readableNodeIds,
    setIsImmersiveEditing,
    setIsShortcutsOverlayOpen,
    setReadingSelection,
    suppressNextSelectionRestore: selectionRestoreSuppression.suppressNextSelectionRestore
  });

  return {
    enterImmersiveEdit: () => setIsImmersiveEditing(true),
    isImmersiveEditing,
    isShortcutsOverlayOpen,
    setIsImmersiveEditing,
    shouldSuppressSelectionRestore: selectionRestoreSuppression.shouldSuppressSelectionRestore
  };
}
