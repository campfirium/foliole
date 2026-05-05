import type { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

export function applyRestoreScrollTop(adapter: CodeMirrorEditorAdapter, restoreScrollTop: number | undefined) {
  if (typeof restoreScrollTop !== 'number' || !Number.isFinite(restoreScrollTop) || restoreScrollTop <= 0) {
    return;
  }
  if (Math.abs(adapter.getScrollTop() - restoreScrollTop) <= 2) {
    return;
  }
  adapter.setScrollTop(restoreScrollTop);
}
