import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

export type ReviewReadingScrollDirection = 'down' | 'up';

const MIN_SCROLL_DELTA = 80;
const PAGE_SCROLL_RATIO = 0.85;

export function scrollReviewReadingSurface(
  editor: EditorAdapter | null,
  direction: ReviewReadingScrollDirection
) {
  if (!editor) {
    return false;
  }
  const metrics = editor.getScrollMetrics();
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  if (maxScrollTop <= 0) {
    return false;
  }
  const delta = Math.max(MIN_SCROLL_DELTA, Math.floor(metrics.clientHeight * PAGE_SCROLL_RATIO));
  const signedDelta = direction === 'down' ? delta : -delta;
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, metrics.scrollTop + signedDelta));
  if (nextScrollTop === metrics.scrollTop) {
    return false;
  }
  editor.setScrollTop(nextScrollTop);
  return true;
}
