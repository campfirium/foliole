import { useEffect, useRef, type MutableRefObject } from 'react';

import { isAndroidSelectionTraceActive, traceAndroidSelectionSnapshot } from '../shared/platform/supportLog/androidSelectionTrace';

import { suppressCompanionPressClick } from './companionPressClickSuppression';
import * as toolbarDom from './companionSelectionToolbarDom';
import {
  getDefaultSelectionClientPoint,
  isExistingHighlightTarget,
  readSelectionClientPoint,
  type CompanionSelectionClientPoint
} from './companionSelectionToolbarState';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';

const ARTICLE_DOCUMENT = '[data-companion-article-document="true"]';
const READING_SURFACE = '[data-companion-reading-surface="true"]';
// Flow's side regions sit above the reading surface and turn its pages.
const READING_EDGE = '[data-companion-reading-edge]';

type TapStart = {
  pointerId: number;
  startedAt: number;
  x: number;
  y: number;
};

type SelectionAtTap = TapStart & ({
  kind: 'managed';
  editor: EditorAdapter | null;
} | {
  /** Only the annotation menu is open, e.g. right after a highlight or cloze was created. */
  kind: 'menu';
} | {
  kind: 'native';
  /** The reader can see what this tap dismisses, so the tap does nothing else. */
  claims: boolean;
  anchorNode: Node | null;
  anchorOffset: number;
  editorFrom: number;
  editorTo: number;
  focusNode: Node | null;
  focusOffset: number;
});

function readTapStart(event: PointerEvent): TapStart {
  return { pointerId: event.pointerId, startedAt: Date.now(), x: event.clientX, y: event.clientY };
}

const isReadingEdge = (target: EventTarget | null) => target instanceof Element && target.closest(READING_EDGE) !== null;

/** Whether the reading screen itself would act on a tap here: toolbars, page turn or a Flow side region. */
function isReadingTapArea(target: EventTarget | null): target is Element {
  return isReadingEdge(target) || (target instanceof Element && target.closest(READING_SURFACE) !== null &&
    !toolbarDom.isCompanionArticleInteractiveTarget(target));
}

/** The reading surface, its click and the Flow side regions all leave a claimed tap alone. */
function claimTap(event: Event) {
  event.preventDefault();
  suppressCompanionPressClick((event.target as Element).ownerDocument);
}

function readSelectionAtTap(editor: EditorAdapter | null, event: PointerEvent): SelectionAtTap | null {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(`${ARTICLE_DOCUMENT}, ${READING_SURFACE}, ${READING_EDGE}`) ||
    (!isReadingEdge(target) && toolbarDom.isCompanionArticleInteractiveTarget(target)) || isExistingHighlightTarget(target)) return null;
  const native = window.getSelection();
  const selection = editor?.getSelection();
  const hasEditorSelection = selection && selection.from !== selection.to;
  const nativeAnchor = native?.anchorNode instanceof Element ? native.anchorNode : native?.anchorNode?.parentElement;
  const hasArticleNativeSelection = Boolean(native && !native.isCollapsed && native.rangeCount > 0 &&
    nativeAnchor?.closest(ARTICLE_DOCUMENT));
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
    ...readTapStart(event), kind: 'native',
    claims: hasArticleNativeSelection,
    anchorNode: native?.anchorNode ?? null,
    anchorOffset: native?.anchorOffset ?? 0,
    editorFrom: selection?.from ?? 0,
    editorTo: selection?.to ?? 0,
    focusNode: native?.focusNode ?? null,
    focusOffset: native?.focusOffset ?? 0
  };
}

function selectionStayedAtTap(start: Extract<SelectionAtTap, { kind: 'native' }>, editor: EditorAdapter | null) {
  const native = window.getSelection();
  const selection = editor?.getSelection();
  return native?.anchorNode === start.anchorNode && native?.anchorOffset === start.anchorOffset &&
    native?.focusNode === start.focusNode && native?.focusOffset === start.focusOffset &&
    (selection?.from ?? 0) === start.editorFrom && (selection?.to ?? 0) === start.editorTo;
}

function clearFinishedTap(
  event: MouseEvent | PointerEvent | TouchEvent,
  started: SelectionAtTap | null,
  args: SelectionAnnotationDocumentEventsArgs
) {
  if (event.type !== 'pointerup' || !started || (event as PointerEvent).pointerId !== started.pointerId ||
    Date.now() - started.startedAt >= 500 || !('clientX' in event) ||
    Math.hypot(event.clientX - started.x, event.clientY - started.y) > 8) return false;
  const editor = args.editorRef.current;
  if (started.kind === 'menu') {
    if (!isReadingTapArea(event.target) || isExistingHighlightTarget(event.target)) return false;
    // The press already closed the menu.
    claimTap(event);
    return true;
  }
  if (started.kind === 'managed') {
    if (!args.hasAdjustableSelection?.() || started.editor !== editor ||
      toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return false;
  } else if ((!isReadingEdge(event.target) && toolbarDom.isCompanionArticleInteractiveTarget(event.target)) ||
    isExistingHighlightTarget(event.target) || !selectionStayedAtTap(started, editor)) return false;
  if (started.kind === 'managed' ? isReadingTapArea(event.target) : started.claims) claimTap(event);
  args.clearSelectionAndCloseToolbar();
  return true;
}

interface SelectionAnnotationDocumentEventsArgs {
  enabled: boolean;
  hasAdjustableSelection?: () => boolean;
  clearSelectionAndCloseToolbar: () => void;
  closeSelectionToolbar: () => void;
  hasOpenSelectionToolbar?: () => boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
  lastFallbackRef: MutableRefObject<CompanionSelectionClientPoint | null>;
  lastSelectionInteractionAtRef: MutableRefObject<number>;
  scheduleSelectionToolbarOpen: (fallback?: CompanionSelectionClientPoint) => void;
}

function readPointerDownTap(args: SelectionAnnotationDocumentEventsArgs, pointer: PointerEvent): SelectionAtTap | null {
  if (pointer.isPrimary === false || pointer.button !== 0 ||
    toolbarDom.isCompanionSelectionToolbarTarget(pointer.target)) return null;
  const editor = args.editorRef.current;
  if (args.hasAdjustableSelection?.()) return { ...readTapStart(pointer), kind: 'managed', editor };
  const selectionTap = readSelectionAtTap(editor, pointer);
  if (selectionTap?.kind === 'native' && args.hasOpenSelectionToolbar?.()) selectionTap.claims = true;
  if (selectionTap || !args.hasOpenSelectionToolbar?.() || hasAnyTextSelection(editor)) return selectionTap;
  return { ...readTapStart(pointer), kind: 'menu' };
}

function hasAnyTextSelection(editor: EditorAdapter | null) {
  const selection = editor?.getSelection();
  return window.getSelection()?.isCollapsed === false || Boolean(selection && selection.from !== selection.to);
}

function recordSelectionSnapshot(editor: EditorAdapter | null) {
  if (!isAndroidSelectionTraceActive()) return;
  const range = editor?.getSelection();
  traceAndroidSelectionSnapshot((node) => editor?.getDocumentPositionAtDomPoint?.(node, 0) != null,
    range?.from ?? -1, range?.to ?? -1);
}

export function useCompanionSelectionAnnotationDocumentEvents(args: SelectionAnnotationDocumentEventsArgs) {
  const tapRef = useRef<SelectionAtTap | null>(null);
  useEffect(() => {
    if (!args.enabled) {
      tapRef.current = null;
      return;
    }
    const rememberSelectionInteraction = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (toolbarDom.isCompanionHighlightRangeDragging()) return;
      if (event.type === 'pointerdown') tapRef.current = readPointerDownTap(args, event as PointerEvent);
      if (event.type === 'touchmove') tapRef.current = null;
      const tap = tapRef.current;
      if (event.type === 'pointermove' && tap && 'clientX' in event &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tapRef.current = null;
      if (toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return;
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      if (!args.hasAdjustableSelection?.()) args.closeSelectionToolbar();
    };
    const handleSelectionEnd = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (toolbarDom.isCompanionHighlightRangeDragging()) {
        if (args.hasAdjustableSelection?.() && event.type === 'pointerup') suppressCompanionPressClick(document);
        return;
      }
      const started = tapRef.current;
      if (event.type === 'pointerup') tapRef.current = null;
      if (clearFinishedTap(event, started, args)) return;
      if (toolbarDom.isCompanionSelectionToolbarTarget(event.target)) return;
      args.lastFallbackRef.current = readSelectionClientPoint(event) ?? args.lastFallbackRef.current ?? getDefaultSelectionClientPoint();
      args.lastSelectionInteractionAtRef.current = Date.now();
      if (!args.hasAdjustableSelection?.()) args.scheduleSelectionToolbarOpen(args.lastFallbackRef.current);
    };
    const handleSelectionChange = () => {
      recordSelectionSnapshot(args.editorRef.current);
      if (args.hasAdjustableSelection?.()) return;
      if (toolbarDom.isCompanionHighlightRangeDragging()) return;
      if (toolbarDom.isCompanionSelectionToolbarActiveElement()) return;
      if (toolbarDom.hasRecentSelectionInteraction(args.lastSelectionInteractionAtRef.current)) {
        args.scheduleSelectionToolbarOpen();
      }
    };
    const cancelTap = () => { tapRef.current = null; };
    document.addEventListener('pointercancel', cancelTap, true);
    document.addEventListener('pointerdown', rememberSelectionInteraction, true);
    document.addEventListener('pointermove', rememberSelectionInteraction, true);
    document.addEventListener('pointerup', handleSelectionEnd, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionEnd, true);
    document.addEventListener('touchmove', rememberSelectionInteraction, true);
    return () => {
      document.removeEventListener('pointercancel', cancelTap, true);
      document.removeEventListener('pointerdown', rememberSelectionInteraction, true);
      document.removeEventListener('pointermove', rememberSelectionInteraction, true);
      document.removeEventListener('pointerup', handleSelectionEnd, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionEnd, true);
      document.removeEventListener('touchmove', rememberSelectionInteraction, true);
    };
  }, [args]);
}
