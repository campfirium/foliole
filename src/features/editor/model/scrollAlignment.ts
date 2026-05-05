export const ANCHOR_VIEWPORT_RATIO_DEFAULT = 0.4;

interface AlignScrollParams {
  currentScrollTop: number;
  cursorViewportTop: number;
  viewportHeight: number;
  viewportTop: number;
  scrollHeight: number;
  targetRatio?: number;
}

export function alignScrollTopToViewportRatio({
  currentScrollTop,
  cursorViewportTop,
  viewportHeight,
  viewportTop,
  scrollHeight,
  targetRatio = ANCHOR_VIEWPORT_RATIO_DEFAULT
}: AlignScrollParams): number {
  if (viewportHeight <= 0 || scrollHeight <= 0) {
    return currentScrollTop;
  }

  const ratio = Math.max(0, Math.min(1, targetRatio));
  const targetViewportTop = viewportTop + viewportHeight * ratio;
  const delta = cursorViewportTop - targetViewportTop;
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const nextScrollTop = currentScrollTop + delta;
  return Math.max(0, Math.min(maxScrollTop, nextScrollTop));
}
