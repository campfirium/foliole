import type { Node } from '../../features/nodes/model/nodeTypes';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import { getSelectionCommandPayload } from '../contextCommands';

import { isImmersiveEditableElement } from './immersiveReadingKeyboard';
import { blurImmersiveActiveElement, clearParagraphMarker } from './immersiveReadingMarker';
import { resolveCurrentParagraphSelection, resolveParagraphSelection } from './immersiveReadingModel';
import { revealSelectionForImmersiveBand, shouldRevealSelectionInImmersiveBand } from './immersiveReadingViewportBand';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function getReadableNodeIds(nodeOrder: string[], nodesById: Record<string, Node>, trashedNodeIds: string[]) {
  return nodeOrder.filter((nodeId) => {
    if (trashedNodeIds.includes(nodeId)) {
      return false;
    }
    const node = nodesById[nodeId];
    return Boolean(node && node.kind !== 'folder');
  });
}

function openNextReadableNode(props: WorkspaceLayoutProps, readableNodeIds: string[]) {
  const currentIndex = props.activeNodeId ? readableNodeIds.indexOf(props.activeNodeId) : -1;
  const nextNodeId = currentIndex >= 0 ? readableNodeIds[currentIndex + 1] : undefined;
  if (nextNodeId) {
    props.onSelectNode(nextNodeId);
  }
}

function handleImmersiveExit(args: {
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
  setIsImmersiveEditing: (value: boolean) => void;
}) {
  const { props, isImmersiveEditing, setIsImmersiveEditing } = args;
  if (isImmersiveEditing) {
    clearParagraphMarker(props.editorAdapterRef);
    blurImmersiveActiveElement();
    setIsImmersiveEditing(false);
    return;
  }
  clearParagraphMarker(props.editorAdapterRef);
  props.onExitImmersiveMode();
}

function selectParagraph(args: {
  getReadingSelection: () => { from: number; to: number };
  direction: 'backward' | 'forward';
  markNextProgrammaticScroll: () => void;
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    return false;
  }
  const editorSelection = editor.getSelection();
  const readingSelection = args.getReadingSelection();
  const currentSelection =
    editorSelection.from === 0 &&
    editorSelection.to === 0 &&
    (readingSelection.from !== 0 || readingSelection.to !== 0)
      ? readingSelection
      : editorSelection;
  const movementBaseSelection = resolveCurrentParagraphSelection(editor.getContent(), currentSelection) ?? currentSelection;
  const nextSelection = resolveParagraphSelection({
    content: editor.getContent(),
    currentSelection: movementBaseSelection,
    direction: args.direction
  });
  if (nextSelection) {
    args.setReadingSelection({ from: nextSelection.from, to: nextSelection.from }, 'immersive-keydown');
    editor.setSelection(nextSelection);
    editor.setParagraphMarker?.(nextSelection);
    if (shouldRevealSelectionInImmersiveBand({
      direction: args.direction,
      props: args.props,
      selection: nextSelection
    })) {
      args.markNextProgrammaticScroll();
      revealSelectionForImmersiveBand({
        direction: args.direction,
        props: args.props,
        selection: nextSelection
      });
    }
    return true;
  }
  editor.setParagraphMarker?.(null);
  if (args.direction === 'forward') {
    openNextReadableNode(args.props, args.readableNodeIds);
    return true;
  }
  return false;
}

function runImmersiveSelectionAction(args: {
  props: WorkspaceLayoutProps;
  type: 'highlight' | 'note';
}) {
  if (!args.props.activeNodeId) {
    return false;
  }
  const payload = getSelectionCommandPayload(args.props.activeNodeId, args.props.editorAdapterRef.current);
  if (!payload) {
    return false;
  }
  if (args.type === 'highlight') {
    args.props.onCreateSelectionHighlight(payload);
    return true;
  }
  args.props.onCreateSelectionNote(payload);
  return true;
}

function handleImmersivePrimaryKey(args: {
  event: KeyboardEvent;
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  if (args.event.key === 'Escape') {
    args.event.preventDefault();
    args.setIsShortcutsOverlayOpen(false);
    handleImmersiveExit(args);
    return true;
  }
  if (args.event.key === 'Enter') {
    if (!args.props.editorAdapterRef.current) {
      return true;
    }
    args.event.preventDefault();
    clearParagraphMarker(args.props.editorAdapterRef);
    args.setIsImmersiveEditing(true);
    args.setIsShortcutsOverlayOpen(false);
    return true;
  }
  if (args.event.key === '?' || (args.event.key === '/' && args.event.shiftKey)) {
    args.event.preventDefault();
    args.setIsShortcutsOverlayOpen((current) => !current);
    return true;
  }
  return false;
}

function handleImmersiveReadingKey(args: {
  event: KeyboardEvent;
  getReadingSelection: () => { from: number; to: number };
  markNextProgrammaticScroll: () => void;
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
}) {
  if (args.event.key === 'ArrowUp' || args.event.key === 'ArrowDown') {
    args.event.preventDefault();
    selectParagraph({
      getReadingSelection: args.getReadingSelection,
      direction: args.event.key === 'ArrowUp' ? 'backward' : 'forward',
      markNextProgrammaticScroll: args.markNextProgrammaticScroll,
      setReadingSelection: args.setReadingSelection,
      props: args.props,
      readableNodeIds: args.readableNodeIds
    });
    return;
  }
  if (args.event.key === ' ' && args.event.shiftKey) {
    args.event.preventDefault();
    selectParagraph({
      getReadingSelection: args.getReadingSelection,
      direction: 'backward',
      markNextProgrammaticScroll: args.markNextProgrammaticScroll,
      setReadingSelection: args.setReadingSelection,
      props: args.props,
      readableNodeIds: args.readableNodeIds
    });
    return;
  }
  if (args.event.key === ' ') {
    args.event.preventDefault();
    selectParagraph({
      getReadingSelection: args.getReadingSelection,
      direction: 'forward',
      markNextProgrammaticScroll: args.markNextProgrammaticScroll,
      setReadingSelection: args.setReadingSelection,
      props: args.props,
      readableNodeIds: args.readableNodeIds
    });
    return;
  }
  if (args.event.key.toLowerCase() === 'h') {
    if (runImmersiveSelectionAction({ props: args.props, type: 'highlight' })) {
      args.event.preventDefault();
    }
    return;
  }
  if (args.event.key.toLowerCase() === 'n' && runImmersiveSelectionAction({ props: args.props, type: 'note' })) {
    args.event.preventDefault();
  }
}

export function handleImmersiveKeydown(args: {
  canToggleImmersiveMode: boolean;
  captureReadingSelectionFromViewport: () => void;
  event: KeyboardEvent;
  getReadingSelection: () => { from: number; to: number };
  isImmersiveEditing: boolean;
  markNextProgrammaticScroll: () => void;
  props: WorkspaceLayoutProps;
  queueReadingSelectionRestore: () => void;
  readableNodeIds: string[];
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  suppressNextSelectionRestore: () => void;
}) {
  if (args.event.defaultPrevented || args.event.repeat || args.event.isComposing) {
    return;
  }
  if (args.event.key === 'F11' && !args.event.altKey && !args.event.ctrlKey && !args.event.metaKey && !args.event.shiftKey) {
    if (!args.canToggleImmersiveMode && !args.props.isImmersiveMode) {
      return;
    }
    args.event.preventDefault();
    pushDebugTrace('immersive.toggle.requested', {
      isImmersiveMode: args.props.isImmersiveMode,
      isImmersiveEditing: args.isImmersiveEditing
    });
    args.suppressNextSelectionRestore();
    if (!args.props.isImmersiveMode) {
      args.captureReadingSelectionFromViewport();
      args.props.beginApplyingReadingPosition(args.getReadingSelection(), 'enter-immersive');
    } else if (!args.isImmersiveEditing) {
      args.queueReadingSelectionRestore();
      args.props.beginApplyingReadingPosition(args.getReadingSelection(), 'exit-immersive');
    }
    args.props.onToggleImmersiveMode();
    return;
  }
  if (!args.props.isImmersiveMode || args.event.altKey || args.event.ctrlKey || args.event.metaKey) {
    return;
  }
  if (isImmersiveEditableElement(args.event.target)) {
    return;
  }
  if (handleImmersivePrimaryKey(args)) {
    return;
  }
  if (args.isImmersiveEditing) {
    return;
  }
  handleImmersiveReadingKey({
    event: args.event,
    getReadingSelection: args.getReadingSelection,
    markNextProgrammaticScroll: args.markNextProgrammaticScroll,
    props: args.props,
    readableNodeIds: args.readableNodeIds,
    setReadingSelection: args.setReadingSelection
  });
}
