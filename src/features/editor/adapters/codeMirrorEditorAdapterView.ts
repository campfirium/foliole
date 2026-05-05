import type { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { pushDebugTrace } from '../../../shared/testing/debugBridge';
import { alignScrollTopToViewportRatio } from '../model/scrollAlignment';

import { createEmptyDecorationsEffect } from './codeMirrorEditorAdapterSupport';

export function alignSelectionInViewport(view: EditorView, position: number, targetRatio?: number) {
  scheduleSelectionAlignment(view, position, targetRatio, 8);
}

export function resolvePositionViewportTop(view: EditorView, position: number) {
  const cursorRect = view.coordsAtPos(position) ?? view.coordsAtPos(position, -1);
  if (cursorRect) {
    return {
      source: 'coords',
      viewportTop: cursorRect.top
    } as const;
  }
  try {
    const lineBlock = view.lineBlockAt(position);
    return {
      source: 'line-block',
      viewportTop: view.scrollDOM.getBoundingClientRect().top + (lineBlock.top - view.scrollDOM.scrollTop)
    } as const;
  } catch {
    return null;
  }
}

function scheduleSelectionAlignmentRetry(
  view: EditorView,
  position: number,
  targetRatio: number | undefined,
  attemptsRemaining: number
) {
  requestAnimationFrame(() => {
    scheduleSelectionAlignment(view, position, targetRatio, attemptsRemaining - 1);
  });
}

function shouldWaitForViewportLayout(scroller: HTMLElement, attemptsRemaining: number) {
  return attemptsRemaining > 0 && (scroller.clientHeight <= 0 || scroller.scrollHeight <= scroller.clientHeight);
}

function shouldRetrySelectionAlignment(args: {
  attemptsRemaining: number;
  maxScrollTop: number;
  nextScrollTop: number;
  position: number;
  scroller: HTMLElement;
  targetRatio: number | undefined;
  view: EditorView;
}) {
  return (
    args.nextScrollTop === args.scroller.scrollTop &&
    args.maxScrollTop > 0 &&
    args.attemptsRemaining > 0 &&
    !isPositionNearViewportRatio(args.view, args.position, args.targetRatio ?? 0.4, 0.05)
  );
}

function traceSelectionAlignment(view: EditorView, resolvedTop: { source: string; viewportTop: number }, nextScrollTop: number, position: number, targetRatio: number | undefined) {
  pushDebugTrace('editor.viewport.align-selection', {
    cursorTop: resolvedTop.viewportTop,
    nextScrollTop,
    position,
    previousScrollTop: view.scrollDOM.scrollTop,
    scrollHeight: view.scrollDOM.scrollHeight,
    source: resolvedTop.source,
    targetRatio: targetRatio ?? null,
    viewportHeight: view.scrollDOM.clientHeight
  });
}

function handleMissingSelectionRect(
  view: EditorView,
  position: number,
  targetRatio: number | undefined,
  attemptsRemaining: number
) {
  if (attemptsRemaining <= 0) {
    pushDebugTrace('editor.viewport.align-selection-missing-rect', {
      position,
      scrollTop: view.scrollDOM.scrollTop,
      targetRatio: targetRatio ?? null
    });
    return true;
  }
  scheduleSelectionAlignmentRetry(view, position, targetRatio, attemptsRemaining);
  return true;
}

function scheduleSelectionAlignment(view: EditorView, position: number, targetRatio: number | undefined, attemptsRemaining: number) {
  const scroller = view.scrollDOM;
  const resolvedTop = resolvePositionViewportTop(view, position);
  if (!resolvedTop) {
    handleMissingSelectionRect(view, position, targetRatio, attemptsRemaining);
    return;
  }

  const viewportRect = scroller.getBoundingClientRect();
  const scrollHeight = scroller.scrollHeight;
  const viewportHeight = scroller.clientHeight;
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  if (shouldWaitForViewportLayout(scroller, attemptsRemaining)) {
    pushDebugTrace('editor.viewport.align-selection-wait-layout', {
      attemptsRemaining,
      position,
      scrollHeight,
      scrollTop: scroller.scrollTop,
      source: resolvedTop.source,
      viewportHeight
    });
    scheduleSelectionAlignmentRetry(view, position, targetRatio, attemptsRemaining);
    return;
  }
  const nextScrollTop = alignScrollTopToViewportRatio({
    currentScrollTop: scroller.scrollTop,
    cursorViewportTop: resolvedTop.viewportTop,
    scrollHeight,
    targetRatio,
    viewportHeight,
    viewportTop: viewportRect.top
  });
  if (shouldRetrySelectionAlignment({
    attemptsRemaining,
    maxScrollTop,
    nextScrollTop,
    position,
    scroller,
    targetRatio,
    view
  })) {
    pushDebugTrace('editor.viewport.align-selection-retry', {
      attemptsRemaining,
      cursorTop: resolvedTop.viewportTop,
      maxScrollTop,
      position,
      scrollHeight,
      scrollTop: scroller.scrollTop,
      targetRatio: targetRatio ?? null,
      viewportHeight
    });
    scheduleSelectionAlignmentRetry(view, position, targetRatio, attemptsRemaining);
    return;
  }
  traceSelectionAlignment(view, resolvedTop, nextScrollTop, position, targetRatio);
  scroller.scrollTop = nextScrollTop;
}

export function isPositionNearViewportRatio(
  view: EditorView,
  position: number,
  targetRatio: number,
  toleranceRatio = 0.05
) {
  const resolvedTop = resolvePositionViewportTop(view, position);
  if (!resolvedTop) {
    return false;
  }
  const viewportRect = view.scrollDOM.getBoundingClientRect();
  const anchorY = viewportRect.top + viewportRect.height * targetRatio;
  const tolerancePx = viewportRect.height * toleranceRatio;
  return Math.abs(resolvedTop.viewportTop - anchorY) <= tolerancePx;
}

export function revealEditorPosition(view: EditorView, position: number) {
  pushDebugTrace('editor.viewport.reveal-position', {
    position,
    scrollTop: view.scrollDOM.scrollTop
  });
  view.dispatch({
    effects: EditorView.scrollIntoView(position, { y: 'center' })
  });
  view.focus();
  alignSelectionInViewport(view, position);
}

export function subscribeToEditorScroll(view: EditorView, listener: () => void) {
  let frameId: number | null = null;
  const handleScroll = () => {
    if (frameId !== null) {
      return;
    }
    frameId = requestAnimationFrame(() => {
      frameId = null;
      listener();
    });
  };
  view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    view.scrollDOM.removeEventListener('scroll', handleScroll);
  };
}

export function resolvePreferredViewportX(rect: { left: number; right: number; width: number }) {
  const safeWidth = Math.max(rect.width, 0);
  const leftInset = Math.min(Math.max(safeWidth * 0.08, 24), Math.max(24, safeWidth - 12));
  return Math.min(rect.left + leftInset, rect.right - 12);
}

export function resolveDocumentPositionAtViewportPoint(view: EditorView, clientX: number, clientY: number) {
  const positionAtCoords = view.posAtCoords({ x: clientX, y: clientY }, false);
  if (typeof positionAtCoords === 'number') {
    return positionAtCoords;
  }
  const documentY = clientY - view.documentTop;
  if (!Number.isFinite(documentY)) {
    return null;
  }
  try {
    return view.lineBlockAtHeight(documentY).from;
  } catch {
    return null;
  }
}

export function resolveDocumentPositionAtViewportY(view: EditorView, clientY: number) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  return resolveDocumentPositionAtViewportPoint(view, resolvePreferredViewportX(contentRect), clientY);
}

export function readEditorScrollMetrics(view: EditorView) {
  return {
    clientHeight: view.scrollDOM.clientHeight,
    scrollHeight: view.scrollDOM.scrollHeight,
    scrollTop: view.scrollDOM.scrollTop
  };
}

export function reconfigureDecorationCompartment(args: {
  buildDecorations: () => ReturnType<typeof EditorView.decorations.of>;
  compartment: Compartment;
  fallbackLabel: string;
  view: EditorView;
}) {
  try {
    args.view.dispatch({
      effects: args.compartment.reconfigure(args.buildDecorations())
    });
  } catch (error) {
    console.error(args.fallbackLabel, error);
    args.view.dispatch({
      effects: createEmptyDecorationsEffect(args.compartment)
    });
  }
}
