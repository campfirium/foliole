import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { getSelectionCommandPayload } from '../contextCommands';

import { findHighlightAtPosition } from './selectionHighlightToggleSupport';
import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

const ACTIVE_HIGHLIGHT_CLASS = 'cm-md-highlight-active';
const HIGHLIGHT_TARGET_SELECTOR = '.cm-md-highlight, .cm-md-highlight-overlap, .cm-md-anchor-overlap';
const EDITOR_TARGET_SELECTOR = '.cm-editor';

function getHighlightElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest(HIGHLIGHT_TARGET_SELECTOR) : null;
}

function clearActiveHighlightElements() {
  document.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`).forEach((element) => {
    element.classList.remove(ACTIVE_HIGHLIGHT_CLASS);
  });
}

function resolveSelectionToolbarPosition(event: MouseEvent) {
  const highlightElement = getHighlightElement(event.target);
  const highlightRect = highlightElement?.getBoundingClientRect();
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = highlightRect ?? range?.getBoundingClientRect();
  const anchor = rect && rect.width > 0 && rect.height > 0
    ? { left: rect.left + rect.width / 2, top: rect.top }
    : { left: event.clientX, top: event.clientY };
  const toolbarWidth = 150;
  const notePanelWidth = 240;
  return {
    left: Math.max(8, Math.min(anchor.left - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8)),
    notePanelLeft: Math.max(8, Math.min(anchor.left - notePanelWidth / 2, window.innerWidth - notePanelWidth - 8)),
    notePanelTop: Math.max(8, (rect?.bottom ?? event.clientY) + 8),
    top: Math.max(8, anchor.top - 46)
  };
}

function isAnnotationToolbarTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-annotation-toolbar="true"]') !== null;
}

function isEditorTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(EDITOR_TARGET_SELECTOR) !== null;
}

function isHighlightTarget(target: EventTarget | null) {
  return getHighlightElement(target) !== null;
}

interface SelectionAnnotationToolbarArgs {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isTrashViewOpen: boolean;
  nodesById: Record<string, Node>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
  trashedNodeIds: string[];
}

function createAnnotationToolbarMouseDownHandler(args: SelectionAnnotationToolbarArgs) {
  return (event: MouseEvent) => {
    if (isAnnotationToolbarTarget(event.target)) {
      return;
    }
    clearActiveHighlightElements();
    args.setContextMenu(null);
  };
}

function openExistingHighlightToolbar(args: SelectionAnnotationToolbarArgs, event: MouseEvent) {
  const cursor = args.editorRef.current?.getSelection();
  const highlightMatch = cursor && isHighlightTarget(event.target)
    ? findHighlightAtPosition(args.activeNodeId ?? '', args.nodesById, cursor.from, args.trashedNodeIds)
    : null;
  if (!highlightMatch) {
    return;
  }
  const position = resolveSelectionToolbarPosition(event);
  getHighlightElement(event.target)?.classList.add(ACTIVE_HIGHLIGHT_CLASS);
  args.setContextMenu({
    canRunCommands: true,
    existingHighlight: highlightMatch,
    kind: 'selection',
    left: position.left,
    mode: 'existing-highlight-toolbar',
    notePanelLeft: position.notePanelLeft,
    notePanelTop: position.notePanelTop,
    payload: null,
    top: position.top
  });
}

function createAnnotationToolbarMouseUpHandler(args: SelectionAnnotationToolbarArgs) {
  return (event: MouseEvent) => {
    if (event.button !== 0 || args.isTrashViewOpen || !args.activeNodeId) {
      return;
    }
    if (isAnnotationToolbarTarget(event.target) || !isEditorTarget(event.target)) {
      return;
    }
    const payload = getSelectionCommandPayload(args.activeNodeId, args.editorRef.current);
    if (!payload) {
      openExistingHighlightToolbar(args, event);
      return;
    }
    const position = resolveSelectionToolbarPosition(event);
    args.setContextMenu({
      canRunCommands: true,
      kind: 'selection',
      left: position.left,
      mode: 'annotation-toolbar',
      notePanelLeft: position.notePanelLeft,
      notePanelTop: position.notePanelTop,
      payload,
      top: position.top
    });
  };
}

export function useSelectionAnnotationToolbar(args: SelectionAnnotationToolbarArgs) {
  useEffect(() => {
    const handleMouseDown = createAnnotationToolbarMouseDownHandler(args);
    const handleMouseUp = createAnnotationToolbarMouseUpHandler(args);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [args]);
}
