import { type EditorView } from '@codemirror/view';

import { pushDebugTrace } from '../../../shared/diagnostics/debugTrace';
import { alignScrollTopToViewportRatio } from '../model/scrollAlignment';

import {
  type AlignmentMeasure,
  isViewportTopNearRatio,
  shouldRetrySelectionAlignment,
  traceSelectionAlignment,
  traceSelectionAlignmentRetry
} from './codeMirrorEditorSelectionAlignmentSupport';

const activeAlignmentRequestIds = new WeakMap<EditorView, number>();

export function alignSelectionInViewport(view: EditorView, position: number, targetRatio?: number) {
  const requestId = (activeAlignmentRequestIds.get(view) ?? 0) + 1;
  activeAlignmentRequestIds.set(view, requestId);
  scheduleSelectionAlignment(view, position, targetRatio, 8, requestId);
}

export function resolvePositionViewportTop(view: EditorView, position: number) {
  const cursorRect = view.coordsAtPos(position) ?? view.coordsAtPos(position, -1);
  if (cursorRect) {
    return { source: 'coords', viewportTop: cursorRect.top } as const;
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
  return isViewportTopNearRatio({
    resolvedTop: resolvedTop.viewportTop,
    targetRatio,
    toleranceRatio,
    viewportHeight: view.scrollDOM.getBoundingClientRect().height,
    viewportTop: view.scrollDOM.getBoundingClientRect().top
  });
}

function scheduleSelectionAlignmentRetry(
  view: EditorView,
  position: number,
  targetRatio: number | undefined,
  attemptsRemaining: number,
  requestId: number
) {
  requestAnimationFrame(() => {
    scheduleSelectionAlignment(view, position, targetRatio, attemptsRemaining - 1, requestId);
  });
}

function shouldWaitForViewportLayout(scroller: HTMLElement, attemptsRemaining: number) {
  return attemptsRemaining > 0 && (scroller.clientHeight <= 0 || scroller.scrollHeight <= scroller.clientHeight);
}

function handleMissingSelectionRect(
  view: EditorView,
  position: number,
  targetRatio: number | undefined,
  attemptsRemaining: number,
  requestId: number
) {
  if (attemptsRemaining <= 0) {
    pushDebugTrace('editor.viewport.align-selection-missing-rect', {
      position,
      scrollTop: view.scrollDOM.scrollTop,
      targetRatio: targetRatio ?? null
    });
    return;
  }
  scheduleSelectionAlignmentRetry(view, position, targetRatio, attemptsRemaining, requestId);
}

function readSelectionAlignmentMeasure(args: {
  attemptsRemaining: number;
  position: number;
  targetRatio: number | undefined;
  view: EditorView;
}): AlignmentMeasure {
  const scroller = args.view.scrollDOM;
  const resolvedTop = resolvePositionViewportTop(args.view, args.position);
  if (!resolvedTop) {
    return { kind: 'missing-rect' };
  }
  const viewportRect = scroller.getBoundingClientRect();
  const scrollHeight = scroller.scrollHeight;
  const viewportHeight = scroller.clientHeight;
  const currentScrollTop = scroller.scrollTop;
  if (shouldWaitForViewportLayout(scroller, args.attemptsRemaining)) {
    return {
      attemptsRemaining: args.attemptsRemaining,
      kind: 'wait-layout',
      position: args.position,
      scrollHeight,
      scrollTop: currentScrollTop,
      source: resolvedTop.source,
      viewportHeight
    };
  }
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  return {
    currentScrollTop,
    cursorTop: resolvedTop.viewportTop,
    kind: 'ready',
    maxScrollTop,
    nearTarget:
      typeof args.targetRatio === 'number'
        ? isViewportTopNearRatio({
            resolvedTop: resolvedTop.viewportTop,
            targetRatio: args.targetRatio,
            viewportHeight,
            viewportTop: viewportRect.top
          })
        : true,
    nextScrollTop: alignScrollTopToViewportRatio({
      currentScrollTop,
      cursorViewportTop: resolvedTop.viewportTop,
      scrollHeight,
      ...(args.targetRatio !== undefined ? { targetRatio: args.targetRatio } : {}),
      viewportHeight,
      viewportTop: viewportRect.top
    }),
    position: args.position,
    scrollHeight,
    source: resolvedTop.source,
    targetRatio: args.targetRatio,
    viewportHeight
  };
}

function writeReadyAlignmentMeasure(args: {
  attemptsRemaining: number;
  measure: Extract<AlignmentMeasure, { kind: 'ready' }>;
  position: number;
  requestId: number;
  targetRatio: number | undefined;
  view: EditorView;
}) {
  if (
    shouldRetrySelectionAlignment({
      attemptsRemaining: args.attemptsRemaining,
      currentScrollTop: args.measure.currentScrollTop,
      maxScrollTop: args.measure.maxScrollTop,
      nearTarget: args.measure.nearTarget,
      nextScrollTop: args.measure.nextScrollTop,
      targetRatio: args.targetRatio
    })
  ) {
    traceSelectionAlignmentRetry({
      attemptsRemaining: args.attemptsRemaining,
      cursorTop: args.measure.cursorTop,
      maxScrollTop: args.measure.maxScrollTop,
      position: args.position,
      scrollHeight: args.measure.scrollHeight,
      scrollTop: args.measure.currentScrollTop,
      targetRatio: args.targetRatio,
      viewportHeight: args.measure.viewportHeight
    });
  }
  traceSelectionAlignment({
    nextScrollTop: args.measure.nextScrollTop,
    position: args.position,
    previousScrollTop: args.view.scrollDOM.scrollTop,
    resolvedTop: { source: args.measure.source, viewportTop: args.measure.cursorTop },
    scrollHeight: args.view.scrollDOM.scrollHeight,
    targetRatio: args.targetRatio,
    viewportHeight: args.view.scrollDOM.clientHeight
  });
  args.view.scrollDOM.scrollTop = args.measure.nextScrollTop;
  if (
    shouldRetrySelectionAlignment({
      attemptsRemaining: args.attemptsRemaining,
      currentScrollTop: args.measure.currentScrollTop,
      maxScrollTop: args.measure.maxScrollTop,
      nearTarget: args.measure.nearTarget,
      nextScrollTop: args.measure.nextScrollTop,
      targetRatio: args.targetRatio
    })
  ) {
    scheduleSelectionAlignmentRetry(args.view, args.position, args.targetRatio, args.attemptsRemaining, args.requestId);
  }
}

function writeSelectionAlignmentMeasure(args: {
  attemptsRemaining: number;
  measure: AlignmentMeasure;
  position: number;
  requestId: number;
  targetRatio: number | undefined;
  view: EditorView;
}) {
  if (args.measure.kind === 'missing-rect') {
    handleMissingSelectionRect(args.view, args.position, args.targetRatio, args.attemptsRemaining, args.requestId);
    return;
  }
  if (args.measure.kind === 'wait-layout') {
    pushDebugTrace('editor.viewport.align-selection-wait-layout', {
      attemptsRemaining: args.measure.attemptsRemaining,
      position: args.measure.position,
      scrollHeight: args.measure.scrollHeight,
      scrollTop: args.measure.scrollTop,
      source: args.measure.source,
      viewportHeight: args.measure.viewportHeight
    });
    scheduleSelectionAlignmentRetry(args.view, args.position, args.targetRatio, args.attemptsRemaining, args.requestId);
    return;
  }
  writeReadyAlignmentMeasure({
    attemptsRemaining: args.attemptsRemaining,
    measure: args.measure,
    position: args.position,
    requestId: args.requestId,
    targetRatio: args.targetRatio,
    view: args.view
  });
}

function scheduleSelectionAlignment(
  view: EditorView,
  position: number,
  targetRatio: number | undefined,
  attemptsRemaining: number,
  requestId: number
) {
  if (activeAlignmentRequestIds.get(view) !== requestId) return;
  view.requestMeasure({
    read: (measuredView) =>
      readSelectionAlignmentMeasure({
        attemptsRemaining,
        position,
        targetRatio,
        view: measuredView
      }),
    write: (measure, measuredView) => {
      if (activeAlignmentRequestIds.get(view) !== requestId) return;
      writeSelectionAlignmentMeasure({
        attemptsRemaining,
        measure: measure as AlignmentMeasure,
        position,
        requestId,
        targetRatio,
        view: measuredView
      });
    }
  });
}
