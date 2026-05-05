import { useEffect, useMemo, useRef, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { onWindowKeydown } from '../../shared/platform/keyboard';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
const PAGE_STEP_RATIO = 0.9;
const SCROLL_EDGE_THRESHOLD_PX = 24;

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

function scrollEditorPage(editor: NonNullable<WorkspaceLayoutProps['editorAdapterRef']['current']>, direction: 'up' | 'down') {
  const metrics = editor.getScrollMetrics();
  const step = Math.max(120, metrics.clientHeight * PAGE_STEP_RATIO);
  const nextScrollTop =
    direction === 'down'
      ? Math.min(Math.max(0, metrics.scrollHeight - metrics.clientHeight), metrics.scrollTop + step)
      : Math.max(0, metrics.scrollTop - step);
  editor.setScrollTop(nextScrollTop);
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

function handleImmersiveNavigation(args: {
  event: KeyboardEvent;
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    return;
  }
  if (args.event.key === 'PageUp' || (args.event.key === ' ' && args.event.shiftKey)) {
    args.event.preventDefault();
    scrollEditorPage(editor, 'up');
    return;
  }
  if (args.event.key !== ' ' && args.event.key !== 'PageDown') {
    return;
  }
  args.event.preventDefault();
  const metrics = editor.getScrollMetrics();
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  if (maxScrollTop - metrics.scrollTop <= SCROLL_EDGE_THRESHOLD_PX) {
    openNextReadableNode(args.props, args.readableNodeIds);
    return;
  }
  scrollEditorPage(editor, 'down');
}

function handleImmersiveKeydown(args: {
  canToggleImmersiveMode: boolean;
  event: KeyboardEvent;
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
  readableNodeIds: string[];
  setIsImmersiveEditing: (value: boolean) => void;
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
  if (args.event.key === 'Escape') {
    args.event.preventDefault();
    handleImmersiveExit(args.props, args.isImmersiveEditing, args.setIsImmersiveEditing);
    return;
  }
  if (isEditableElement(args.event.target)) {
    return;
  }
  if (args.event.key === 'Enter') {
    if (!args.props.editorAdapterRef.current) {
      return;
    }
    args.event.preventDefault();
    args.setIsImmersiveEditing(true);
    return;
  }
  if (args.isImmersiveEditing) {
    return;
  }
  handleImmersiveNavigation({
    event: args.event,
    props: args.props,
    readableNodeIds: args.readableNodeIds
  });
}

export function useImmersiveReadingMode(props: WorkspaceLayoutProps) {
  const [isImmersiveEditing, setIsImmersiveEditing] = useState(false);
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
      return;
    }
    if (props.isStudyMode) {
      exitImmersiveModeRef.current();
      return;
    }
    setIsImmersiveEditing(false);
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
          setIsImmersiveEditing
        })
      ),
    [canToggleImmersiveMode, isImmersiveEditing, props, readableNodeIds]
  );

  return {
    enterImmersiveEdit: () => setIsImmersiveEditing(true),
    isImmersiveEditing,
    setIsImmersiveEditing
  };
}
