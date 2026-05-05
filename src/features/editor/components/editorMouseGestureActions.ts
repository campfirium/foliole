import type { EditorAdapter } from '../adapters/EditorAdapter';
import type { EditorMouseGestureActionId } from '../model/editorMouseGestures';

export function runEditorMouseGestureAction(
  adapter: EditorAdapter | null,
  action: EditorMouseGestureActionId
): boolean {
  if (!adapter) {
    return false;
  }

  if (action === 'scroll-top') {
    adapter.setScrollTop(0);
    return true;
  }

  if (action === 'scroll-bottom') {
    const metrics = adapter.getScrollMetrics();
    adapter.setScrollTop(Math.max(0, metrics.scrollHeight - metrics.clientHeight));
    return true;
  }

  return false;
}
