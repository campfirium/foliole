import type { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { pushDebugTrace } from '../../../shared/testing/debugBridge';
import { alignScrollTopToViewportRatio } from '../model/scrollAlignment';

import { createEmptyDecorationsEffect } from './codeMirrorEditorAdapterSupport';

export function alignSelectionInViewport(view: EditorView, position: number, targetRatio?: number) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduleSelectionAlignment(view, position, targetRatio, 8);
    });
  });
}

function resolvePositionViewportTop(view: EditorView, position: number) {
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

function scheduleSelectionAlignment(view: EditorView, position: number, targetRatio: number | undefined, attemptsRemaining: number) {
  const scroller = view.scrollDOM;
  const resolvedTop = resolvePositionViewportTop(view, position);
  if (!resolvedTop) {
    if (attemptsRemaining <= 0) {
      pushDebugTrace('editor.viewport.align-selection-missing-rect', {
        position,
        scrollTop: scroller.scrollTop,
        targetRatio: targetRatio ?? null
      });
      return;
    }
    requestAnimationFrame(() => {
      scheduleSelectionAlignment(view, position, targetRatio, attemptsRemaining - 1);
    });
    return;
  }

  const viewportRect = scroller.getBoundingClientRect();
  const scrollHeight = scroller.scrollHeight;
  const viewportHeight = scroller.clientHeight;
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  if ((viewportHeight <= 0 || scrollHeight <= viewportHeight) && attemptsRemaining > 0) {
    pushDebugTrace('editor.viewport.align-selection-wait-layout', {
      attemptsRemaining,
      position,
      scrollHeight,
      scrollTop: scroller.scrollTop,
      source: resolvedTop.source,
      viewportHeight
    });
    requestAnimationFrame(() => {
      scheduleSelectionAlignment(view, position, targetRatio, attemptsRemaining - 1);
    });
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
  if (nextScrollTop === scroller.scrollTop && maxScrollTop > 0 && attemptsRemaining > 0 && !isPositionNearViewportRatio(view, position, targetRatio ?? 0.4, 0.05)) {
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
    requestAnimationFrame(() => {
      scheduleSelectionAlignment(view, position, targetRatio, attemptsRemaining - 1);
    });
    return;
  }
  pushDebugTrace('editor.viewport.align-selection', {
    cursorTop: resolvedTop.viewportTop,
    nextScrollTop,
    position,
    previousScrollTop: scroller.scrollTop,
    scrollHeight,
    source: resolvedTop.source,
    targetRatio: targetRatio ?? null
    ,
    viewportHeight
  });
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
  const handleScroll = () => listener();
  view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
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
