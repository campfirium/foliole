import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { getSelectionCommandPayload } from '../contextCommands';

import {
  getWholeImageExcerptTarget,
  resolveExistingExcerptNode
} from './existingExcerptTarget';
import {
  openPdfExcerptToolbar,
  openWholeImageExcerptToolbar,
  resolveSelectionToolbarPosition
} from './existingExcerptToolbarOpeners';
import {
  findPdfHighlightTargetAtPoint,
  getPdfHighlightTarget
} from './pdfExistingHighlightTarget';
import {
  clearActiveHighlightElements,
  createSelectionToolbarDeletionHandler,
  isEditorTarget
} from './selectionAnnotationToolbarLifecycle';
import { findTextAnchorAtPosition } from './selectionHighlightToggleSupport';
import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

const ACTIVE_HIGHLIGHT_CLASS = 'cm-md-highlight-active';
const HIGHLIGHT_TARGET_SELECTOR = '.cm-md-highlight, .cm-md-highlight-overlap, .cm-md-cloze, .cm-md-anchor-overlap';

function getHighlightElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest(HIGHLIGHT_TARGET_SELECTOR) : null;
}

function isAnnotationToolbarTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-annotation-toolbar="true"]') !== null;
}

function isHighlightRangeHandleTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-highlight-range-handle="true"]') !== null;
}

function isHighlightTarget(target: EventTarget | null) {
  return getHighlightElement(target) !== null;
}

function resolveHighlightClickPosition(
  editor: EditorAdapter | null,
  event: MouseEvent
) {
  const clickedPosition = editor?.getDocumentPositionAtClientPoint?.(event.clientX, event.clientY);
  if (clickedPosition !== null && clickedPosition !== undefined) {
    return clickedPosition;
  }
  return editor?.getSelection().from ?? null;
}

interface SelectionAnnotationToolbarArgs {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isTrashViewOpen: boolean;
  nodesById: Record<string, Node>;
  selectionToolbarEnabled?: boolean;
  setContextMenu: (value: EditorContextMenuState | null) => void;
  trashedNodeIds: string[];
}

function createAnnotationToolbarMouseDownHandler(args: SelectionAnnotationToolbarArgs) {
  return (event: MouseEvent) => {
    if (isAnnotationToolbarTarget(event.target) || isHighlightRangeHandleTarget(event.target)) {
      return;
    }
    clearActiveHighlightElements();
    args.setContextMenu(null);
  };
}

function openExistingHighlightToolbar(args: SelectionAnnotationToolbarArgs, event: MouseEvent) {
  const position = isHighlightTarget(event.target)
    ? resolveHighlightClickPosition(args.editorRef.current, event)
    : null;
  const highlightMatch = position !== null
    ? findTextAnchorAtPosition(args.activeNodeId ?? '', args.nodesById, position, args.trashedNodeIds)
    : null;
  if (!highlightMatch) {
    return false;
  }
  const node = args.nodesById[highlightMatch.nodeId];
  if (!node) return false;
  const toolbarPosition = resolveSelectionToolbarPosition(event, getHighlightElement(event.target));
  getHighlightElement(event.target)?.classList.add(ACTIVE_HIGHLIGHT_CLASS);
  args.setContextMenu({
    canRunCommands: true,
    existingHighlight: resolveExistingExcerptNode(node, {
      canAdjustRange: Boolean(highlightMatch.canAdjustRange),
      originalText: highlightMatch.originalText
    }),
    kind: 'selection',
    left: toolbarPosition.left,
    mode: 'existing-highlight-toolbar',
    notePanelLeft: toolbarPosition.notePanelLeft,
    notePanelTop: toolbarPosition.notePanelTop,
    payload: null,
    top: toolbarPosition.top
  });
  return true;
}

function hasPdfTextSelection(target: EventTarget | null) {
  const selection = window.getSelection();
  return target instanceof Element &&
    target.closest('[data-testid="pdf-document-surface"]') !== null &&
    Boolean(selection && !selection.isCollapsed && selection.rangeCount > 0);
}

function createAnnotationToolbarMouseUpHandler(args: SelectionAnnotationToolbarArgs) {
  return (event: MouseEvent) => {
    if (!args.selectionToolbarEnabled || event.button !== 0 || args.isTrashViewOpen || !args.activeNodeId) {
      return;
    }
    if (isAnnotationToolbarTarget(event.target) || !isEditorTarget(event.target)) {
      if (hasPdfTextSelection(event.target)) {
        return;
      }
      const pdfTarget = getPdfHighlightTarget(event.target) ??
        findPdfHighlightTargetAtPoint(event.clientX, event.clientY);
      if (pdfTarget) {
        void openPdfExcerptToolbar(args, event, pdfTarget);
      }
      return;
    }
    const wholeImageTarget = getWholeImageExcerptTarget(event.target);
    if (wholeImageTarget && openWholeImageExcerptToolbar(args, event, wholeImageTarget)) return;
    if (isHighlightTarget(event.target) && openExistingHighlightToolbar(args, event)) {
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

function createPdfHighlightKeyDownHandler(args: SelectionAnnotationToolbarArgs) {
  return (event: KeyboardEvent) => {
    if (!args.selectionToolbarEnabled || args.isTrashViewOpen || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }
    const target = getPdfHighlightTarget(event.target);
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const mouseEvent = new MouseEvent('mouseup', {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    const opened = openPdfExcerptToolbar(args, mouseEvent, target);
    if (opened instanceof Promise) {
      event.preventDefault();
      void opened;
    } else if (opened) {
      event.preventDefault();
    }
  };
}

export function useSelectionAnnotationToolbar(args: SelectionAnnotationToolbarArgs) {
  useEffect(() => {
    if (args.selectionToolbarEnabled === false) {
      args.setContextMenu(null);
    }
  }, [args.selectionToolbarEnabled, args.setContextMenu]);

  useEffect(() => {
    const handleMouseDown = createAnnotationToolbarMouseDownHandler(args);
    const handleMouseUp = createAnnotationToolbarMouseUpHandler(args);
    const handleKeyDown = createPdfHighlightKeyDownHandler(args);
    const handleDeletion = createSelectionToolbarDeletionHandler(args);
    document.addEventListener('keydown', handleDeletion, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('keydown', handleDeletion, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [args]);
}
