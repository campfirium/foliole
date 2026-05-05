import { useEffect, useMemo, useRef, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { onWindowKeydown } from '../../shared/platform/keyboard';
import { getSelectionCommandPayload } from '../contextCommands';

import { resolveParagraphSelection } from './immersiveReadingModel';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true;
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled;
  }
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }
  return false;
}

function getReadableNodeIds(nodeOrder: string[], nodesById: Record<string, Node>, trashedNodeIds: string[]) {
  return nodeOrder.filter((nodeId) => {
    if (trashedNodeIds.includes(nodeId)) {
      return false;
    }
    const node = nodesById[nodeId];
    return Boolean(node && node.kind !== 'folder');
  });
}

function focusEditor(editorAdapterRef: WorkspaceLayoutProps['editorAdapterRef']) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      editorAdapterRef.current?.focus();
    });
  });
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function openNextReadableNode(props: WorkspaceLayoutProps, readableNodeIds: string[]) {
  const currentIndex = props.activeNodeId ? readableNodeIds.indexOf(props.activeNodeId) : -1;
  const nextNodeId = currentIndex >= 0 ? readableNodeIds[currentIndex + 1] : undefined;
  if (nextNodeId) {
    props.onSelectNode(nextNodeId);
  }
}

function handleImmersiveExit(props: WorkspaceLayoutProps, isImmersiveEditing: boolean, setIsImmersiveEditing: (value: boolean) => void) {
  if (isImmersiveEditing) {
    blurActiveElement();
    setIsImmersiveEditing(false);
    return;
  }
  props.onExitImmersiveMode();
}

function selectParagraph(args: {
  direction: 'backward' | 'forward';
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    return false;
  }
  const nextSelection = resolveParagraphSelection({
    content: editor.getContent(),
    currentSelection: editor.getSelection(),
    direction: args.direction
  });
  if (nextSelection) {
    editor.revealSelection(nextSelection);
    return true;
  }
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
  readableNodeIds: string[];
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  if (args.event.key === 'Escape') {
    args.event.preventDefault();
    args.setIsShortcutsOverlayOpen(false);
    handleImmersiveExit(args.props, args.isImmersiveEditing, args.setIsImmersiveEditing);
    return true;
  }
  if (args.event.key === 'Enter') {
    if (!args.props.editorAdapterRef.current) {
      return true;
    }
    args.event.preventDefault();
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
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
}) {
  if (args.event.key === ' ' && args.event.shiftKey) {
    args.event.preventDefault();
    selectParagraph({ direction: 'backward', props: args.props, readableNodeIds: args.readableNodeIds });
    return;
  }
  if (args.event.key === ' ') {
    args.event.preventDefault();
    selectParagraph({ direction: 'forward', props: args.props, readableNodeIds: args.readableNodeIds });
    return;
  }
  if (args.event.key.toLowerCase() === 'h') {
    if (runImmersiveSelectionAction({ props: args.props, type: 'highlight' })) {
      args.event.preventDefault();
    }
    return;
  }
  if (args.event.key.toLowerCase() === 'n') {
    if (runImmersiveSelectionAction({ props: args.props, type: 'note' })) {
      args.event.preventDefault();
    }
  }
}

function handleImmersiveKeydown(args: {
  canToggleImmersiveMode: boolean;
  event: KeyboardEvent;
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  if (args.event.defaultPrevented || args.event.repeat || args.event.isComposing) {
    return;
  }
  if (args.event.key === 'F11' && !args.event.altKey && !args.event.ctrlKey && !args.event.metaKey && !args.event.shiftKey) {
    if (!args.canToggleImmersiveMode && !args.props.isImmersiveMode) {
      return;
    }
    args.event.preventDefault();
    args.props.onToggleImmersiveMode();
    return;
  }
  if (!args.props.isImmersiveMode || args.event.altKey || args.event.ctrlKey || args.event.metaKey) {
    return;
  }
  if (isEditableElement(args.event.target)) {
    return;
  }
  if (handleImmersivePrimaryKey(args)) {
    return;
  }
  if (args.isImmersiveEditing) {
    return;
  }
  handleImmersiveReadingKey({ event: args.event, props: args.props, readableNodeIds: args.readableNodeIds });
}

export function useImmersiveReadingMode(props: WorkspaceLayoutProps) {
  const [isImmersiveEditing, setIsImmersiveEditing] = useState(false);
  const [isShortcutsOverlayOpen, setIsShortcutsOverlayOpen] = useState(false);
  const exitImmersiveModeRef = useRef(props.onExitImmersiveMode);
  const readableNodeIds = useMemo(
    () => getReadableNodeIds(props.nodeOrder, props.nodesById, props.trashedNodeIds),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );
  const canToggleImmersiveMode = Boolean(props.activeNodeId && readableNodeIds.includes(props.activeNodeId)) && !props.isStudyMode;

  useEffect(() => {
    exitImmersiveModeRef.current = props.onExitImmersiveMode;
  }, [props.onExitImmersiveMode]);

  useEffect(() => {
    if (!props.isImmersiveMode) {
      setIsImmersiveEditing(false);
      setIsShortcutsOverlayOpen(false);
      return;
    }
    if (props.isStudyMode) {
      exitImmersiveModeRef.current();
      return;
    }
    setIsImmersiveEditing(false);
    setIsShortcutsOverlayOpen(false);
  }, [props.activeNodeId, props.isImmersiveMode, props.isStudyMode]);

  useEffect(() => {
    if (!props.isImmersiveMode || !isImmersiveEditing) {
      return;
    }
    focusEditor(props.editorAdapterRef);
  }, [isImmersiveEditing, props.editorAdapterRef, props.isImmersiveMode]);

  useEffect(
    () =>
      onWindowKeydown((event) =>
        handleImmersiveKeydown({
          canToggleImmersiveMode,
          event,
          isImmersiveEditing,
          props,
          readableNodeIds,
          setIsImmersiveEditing,
          setIsShortcutsOverlayOpen
        })
      ),
    [canToggleImmersiveMode, isImmersiveEditing, props, readableNodeIds]
  );

  return {
    enterImmersiveEdit: () => setIsImmersiveEditing(true),
    isImmersiveEditing,
    isShortcutsOverlayOpen,
    setIsImmersiveEditing
  };
}
