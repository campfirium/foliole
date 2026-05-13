import type { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import type { EditorViewState } from './markdownEditorTypes';

const RESTORE_SCROLL_SETTLE_TOLERANCE_PX = 8;
type RestoreSelection = NonNullable<EditorViewState['selection']> | null;

export function isRestoreScrollSettled(adapter: CodeMirrorEditorAdapter, restoreScrollTop: number | undefined) {
  if (typeof restoreScrollTop !== 'number' || !Number.isFinite(restoreScrollTop) || restoreScrollTop <= 0) {
    return true;
  }
  return Math.abs(adapter.getScrollTop() - restoreScrollTop) <= RESTORE_SCROLL_SETTLE_TOLERANCE_PX;
}

export function isRestoreViewportRatioSettled(
  adapter: CodeMirrorEditorAdapter,
  selection: RestoreSelection,
  targetViewportRatio: number | null | undefined
) {
  if (typeof targetViewportRatio !== 'number') {
    return true;
  }
  if (!selection || typeof adapter.isPositionNearViewportRatio !== 'function') {
    return false;
  }
  return adapter.isPositionNearViewportRatio(selection.from, targetViewportRatio, 0.05);
}
