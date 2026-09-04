import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

function getScrollableMetrics(adapter: EditorAdapter | null) {
  if (!adapter) return null;
  const metrics = adapter.getScrollMetrics();
  return metrics.clientHeight > 0 && metrics.scrollHeight > metrics.clientHeight ? metrics : null;
}

export function canScrollCurrentDocument(adapter: EditorAdapter | null) {
  return Boolean(getScrollableMetrics(adapter));
}

export function createPaletteDocumentScrollActions(editorRef: { current: EditorAdapter | null }) {
  return {
    scrollDocumentBottom: () => {
      const metrics = getScrollableMetrics(editorRef.current);
      if (!metrics) return false;
      editorRef.current?.setScrollTop(metrics.scrollHeight - metrics.clientHeight);
      return true;
    },
    scrollDocumentTop: () => {
      if (!getScrollableMetrics(editorRef.current)) return false;
      editorRef.current?.setScrollTop(0);
      return true;
    }
  };
}
