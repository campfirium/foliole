import { useEffect, useRef, type MutableRefObject } from 'react';

import * as toolbarDom from './companionSelectionToolbarDom';
import {
  getDefaultSelectionClientPoint,
  isExistingHighlightTarget,
  readSelectionClientPoint,
  type CompanionSelectionClientPoint
} from './companionSelectionToolbarState';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';

type SelectionAtTap = {
  anchorNode: Node | null;
  anchorOffset: number;
  editorFrom: number;
  editorTo: number;
  focusNode: Node | null;
  focusOffset: number;
  startedAt: number;
  x: number;
  y: number;
};

function readSelectionAtTap(editor: EditorAdapter | null, event: PointerEvent): SelectionAtTap | null {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('[data-companion-readable-document="true"]') ||
    toolbarDom.isCompanionArticleInteractiveTarget(target) || isExistingHighlightTarget(target)) return null;
  const native = window.getSelection();
  const selection = editor?.getSelection();
  const hasEditorSelection = selection && selection.from !== selection.to;
  const nativeAnchor = native?.anchorNode instanceof Element ? native.anchorNode : native?.anchorNode?.parentElement;
  const hasArticleNativeSelection = Boolean(native && !native.isCollapsed && native.rangeCount > 0 &&
    nativeAnchor?.closest('[data-companion-readable-document="true"]'));
  if (!hasEditorSelection && !hasArticleNativeSelection) return null;
  const rects = hasArticleNativeSelection && native
    ? Array.from({ length: native.rangeCount }, (_, index) => Array.from(native.getRangeAt(index).getClientRects())).flat()
    : [];
  const overSelection = rects.length > 0
    ? rects.some((rect) => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)
    : hasEditorSelection && (() => {
      const position = editor?.getDocumentPositionAtClientPoint?.(event.clientX, event.clientY);
      return position !== null && position !== undefined && position >= selection.from && position < selection.to;
    })();
  if (overSelection) return null;
  return {
    anchorNode: native?.anchorNode ?? null,
    anchorOffset: native?.anchorOffset ?? 0,
    editorFrom: selection?.from ?? 0,
    editorTo: selection?.to ?? 0,
    focusNode: native?.focusNode ?? null,
    focusOffset: native?.focusOffset ?? 0,
    startedAt: Date.now(), x: event.clientX, y: event.clientY
  };
}

function selectionStayedAtTap(start: SelectionAtTap, editor: EditorAdapter | null) {
  const native = window.getSelection();
  const selection = editor?.getSelection();
  return Date.now() - start.startedAt < 500 &&
    native?.anchorNode === start.anchorNode && native?.anchorOffset === start.anchorOffset &&
    native?.focusNode === start.focusNode && native?.focusOffset === start.focusOffset &&
    (selection?.from ?? 0) === start.editorFrom && (selection?.to ?? 0) === start.editorTo;
}

function clearFinishedOutsideTap(
  event: MouseEvent | PointerEvent | TouchEvent,
  started: SelectionAtTap | null,
  args: { clearSelectionAndCloseToolbar: () => void; editorRef: MutableRefObject<EditorAdapter | null> }
) {
  if (event.type !== 'pointerup' || !started || toolbarDom.isCompanionArticleInteractiveTarget(event.target) ||
    isExistingHighlightTarget(event.target) || !selectionStayedAtTap(started, args.editorRef.current)) return false;
  args.clearSelectionAndCloseToolbar();
  return true;
}

export function useCompanionSelectionAnnotationDocumentEvents(args: {
  clearSelectionAndCloseToolbar: () => void;
  closeSelectionToolbar: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastFallbackRef: MutableRefObject<CompanionSelectionClientPoint | null>;
  lastSelectionInteractionAtRef: MutableRefObject<number>;
  scheduleSelectionToolbarOpen: (fallback?: CompanionSelectionClientPoint, allowExistingHighlight?: boolean) => void;
}) {
  const tapRef = useRef<SelectionAtTap | null>(null);
  useEffect(() => {
    const rememberSelectionInteraction = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (event.type === 'pointerdown') tapRef.current = readSelectionAtTap(args.editorRef.current, event as PointerEvent);
      if (event.type === 'touchmove') tapRef.current = null;
      const tap = tapRef.current;
      if (event.type === 'pointermove' && tap && 'clientX' in event &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tapRef.current = null;
      if (toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return;
      if (isExistingHighlightTarget(event.target)) toolbarDom.activateCompanionHighlightTarget(event.target);
      else toolbarDom.clearCompanionActiveHighlightElements();
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      args.closeSelectionToolbar();
    };
    const handleSelectionEnd = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const started = tapRef.current;
      if (event.type === 'pointerup') tapRef.current = null;
      if (clearFinishedOutsideTap(event, started, args)) return;
      if (toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return;
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      if (isExistingHighlightTarget(event.target)) toolbarDom.activateCompanionHighlightTarget(event.target);
      else toolbarDom.clearCompanionActiveHighlightElements();
      args.scheduleSelectionToolbarOpen(args.lastFallbackRef.current, isExistingHighlightTarget(event.target));
    };
    const handleSelectionChange = () => {
      if (toolbarDom.isCompanionSelectionToolbarActiveElement()) return;
      if (toolbarDom.hasRecentSelectionInteraction(args.lastSelectionInteractionAtRef.current)) {
        args.scheduleSelectionToolbarOpen(undefined, false);
      }
    };
    document.addEventListener('pointerdown', rememberSelectionInteraction, true);
    document.addEventListener('pointermove', rememberSelectionInteraction, true);
    document.addEventListener('pointerup', handleSelectionEnd, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionEnd, true);
    document.addEventListener('touchmove', rememberSelectionInteraction, true);
    return () => {
      document.removeEventListener('pointerdown', rememberSelectionInteraction, true);
      document.removeEventListener('pointermove', rememberSelectionInteraction, true);
      document.removeEventListener('pointerup', handleSelectionEnd, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionEnd, true);
      document.removeEventListener('touchmove', rememberSelectionInteraction, true);
    };
  }, [args]);
}
