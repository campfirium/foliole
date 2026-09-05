import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { useCommandShortcutMap } from '../../features/settings/context/hotkeySettingsContext';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { onWindowKeydownCapture } from '../../shared/platform/keyboard';

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
import { useImmersiveSelectionRestoreSuppression } from './useImmersiveSelectionRestoreSuppression';
import { useImmersiveWindowChrome } from './useImmersiveWindowChrome';

function useImmersiveLifecycleReset(
  props: Pick<
    ImmersiveReadingModeSource,
    'activeNodeId' | 'editorAdapterRef' | 'isImmersiveMode' | 'onExitImmersiveMode'
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
    clearParagraphMarker(props.editorAdapterRef);
    shouldSkipNextScrollSyncRef.current = false;
    setIsImmersiveEditing(false);
    setIsShortcutsOverlayOpen(false);
  }, [
    props.activeNodeId,
    props.editorAdapterRef,
    props.isImmersiveMode,
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
  toggleShortcuts: ReturnType<typeof useCommandShortcutMap>[string];
}) {
  useEffect(
    () =>
      onWindowKeydownCapture((event) =>
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
          suppressNextSelectionRestore: args.suppressNextSelectionRestore,
          toggleShortcuts: args.toggleShortcuts
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
      args.suppressNextSelectionRestore,
      args.toggleShortcuts
    ]
  );
}

function useImmersiveModeDependencies(props: ImmersiveReadingModeSource) {
  const selectionState = useReadingSelectionState(props);
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  return {
    ...selectionState,
    canToggleImmersiveMode:
      Boolean(props.activeNodeId && activeNode && activeNode.kind !== 'folder' && !props.trashedNodeIds.includes(props.activeNodeId))
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

function createImmersiveReadingModeResult(args: {
  isImmersiveEditing: boolean;
  setIsImmersiveEditing: (value: boolean) => void;
  isShortcutsOverlayOpen: boolean;
  shouldSuppressSelectionRestore: () => boolean;
}) {
  return {
    enterImmersiveEdit: () => args.setIsImmersiveEditing(true),
    ...args
  };
}

export function useImmersiveReadingMode(props: ImmersiveReadingModeSource) {
  const shortcutMap = useCommandShortcutMap();
  const [isImmersiveEditing, setIsImmersiveEditing] = useState(false);
  const [isShortcutsOverlayOpen, setIsShortcutsOverlayOpen] = useState(false);
  const exitImmersiveModeRef = useRef(props.onExitImmersiveMode);
  const shouldSkipNextScrollSyncRef = useRef(false);
  const wasImmersiveModeRef = useRef(props.isImmersiveMode);
  useImmersiveWindowChrome(props.isImmersiveMode);
  const selectionRestoreSuppression = useImmersiveSelectionRestoreSuppression(props);
  const readableNodeIds = useMemo(
    () =>
      props.isImmersiveMode
        ? getReadableNodeIds(props.nodeOrder, props.nodesById, props.trashedNodeIds)
        : [],
    [props.isImmersiveMode, props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );
  const modeDependencies = useImmersiveModeDependencies(props);
  useImmersiveLifecycleReset(props, setIsImmersiveEditing, setIsShortcutsOverlayOpen, shouldSkipNextScrollSyncRef, exitImmersiveModeRef);
  useImmersiveReadingPositionSync({
    ...modeDependencies,
    isImmersiveEditing,
    props,
    shouldSkipNextScrollSyncRef,
    wasImmersiveModeRef
  });
  useImmersiveEditingFocusEffect(props.editorAdapterRef, isImmersiveEditing, props.isImmersiveMode);
  useImmersiveKeyboardHandler({
    ...modeDependencies,
    isImmersiveEditing,
    markNextProgrammaticScroll: () => {
      shouldSkipNextScrollSyncRef.current = true;
    },
    props,
    readableNodeIds,
    setIsImmersiveEditing,
    setIsShortcutsOverlayOpen,
    suppressNextSelectionRestore: selectionRestoreSuppression.suppressNextSelectionRestore,
    toggleShortcuts: shortcutMap[APP_COMMAND_IDS.toggleImmersiveMode]
  });

  return createImmersiveReadingModeResult({
    isImmersiveEditing,
    isShortcutsOverlayOpen,
    setIsImmersiveEditing,
    shouldSuppressSelectionRestore: selectionRestoreSuppression.shouldSuppressSelectionRestore
  });
}
