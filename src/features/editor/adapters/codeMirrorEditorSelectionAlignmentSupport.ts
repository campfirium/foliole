import { pushDebugTrace } from '../../../shared/diagnostics/debugTrace';

export type ResolvedViewportTop = {
  source: string;
  viewportTop: number;
};

export type AlignmentMeasure =
  | { kind: 'missing-rect' }
  | {
      attemptsRemaining: number;
      kind: 'wait-layout';
      position: number;
      scrollHeight: number;
      scrollTop: number;
      source: string;
      viewportHeight: number;
    }
  | {
      currentScrollTop: number;
      cursorTop: number;
      kind: 'ready';
      maxScrollTop: number;
      nearTarget: boolean;
      nextScrollTop: number;
      position: number;
      scrollHeight: number;
      source: string;
      targetRatio: number | undefined;
      viewportHeight: number;
    };

export function shouldRetrySelectionAlignment(args: {
  attemptsRemaining: number;
  currentScrollTop: number;
  maxScrollTop: number;
  nextScrollTop: number;
  nearTarget: boolean;
  targetRatio: number | undefined;
}) {
  return (
    args.attemptsRemaining > 0 &&
    args.maxScrollTop > 0 &&
    typeof args.targetRatio === 'number' &&
    (args.nextScrollTop !== args.currentScrollTop || !args.nearTarget)
  );
}

export function isViewportTopNearRatio(args: {
  resolvedTop: number;
  targetRatio: number;
  toleranceRatio?: number;
  viewportHeight: number;
  viewportTop: number;
}) {
  const anchorY = args.viewportTop + args.viewportHeight * args.targetRatio;
  const tolerancePx = args.viewportHeight * (args.toleranceRatio ?? 0.05);
  return Math.abs(args.resolvedTop - anchorY) <= tolerancePx;
}

export function traceSelectionAlignment(args: {
  nextScrollTop: number;
  position: number;
  previousScrollTop: number;
  resolvedTop: ResolvedViewportTop;
  scrollHeight: number;
  targetRatio: number | undefined;
  viewportHeight: number;
}) {
  pushDebugTrace('editor.viewport.align-selection', {
    cursorTop: args.resolvedTop.viewportTop,
    nextScrollTop: args.nextScrollTop,
    position: args.position,
    previousScrollTop: args.previousScrollTop,
    scrollHeight: args.scrollHeight,
    source: args.resolvedTop.source,
    targetRatio: args.targetRatio ?? null,
    viewportHeight: args.viewportHeight
  });
}

export function traceSelectionAlignmentRetry(args: {
  attemptsRemaining: number;
  cursorTop: number;
  maxScrollTop: number;
  position: number;
  scrollHeight: number;
  scrollTop: number;
  targetRatio: number | undefined;
  viewportHeight: number;
}) {
  pushDebugTrace('editor.viewport.align-selection-retry', {
    attemptsRemaining: args.attemptsRemaining,
    cursorTop: args.cursorTop,
    maxScrollTop: args.maxScrollTop,
    position: args.position,
    scrollHeight: args.scrollHeight,
    scrollTop: args.scrollTop,
    targetRatio: args.targetRatio ?? null,
    viewportHeight: args.viewportHeight
  });
}
