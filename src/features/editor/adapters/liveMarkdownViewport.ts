import type { EditorView, ViewUpdate } from '@codemirror/view';

export interface VisibleLineWindow {
  endLineNumber: number;
  startLineNumber: number;
}

export function resolveVisibleLineWindow(view: EditorView): VisibleLineWindow {
  if (view.viewport.to > view.viewport.from) {
    return {
      endLineNumber: view.state.doc.lineAt(Math.max(view.viewport.to - 1, view.viewport.from)).number,
      startLineNumber: view.state.doc.lineAt(view.viewport.from).number
    };
  }

  const firstVisibleRange = view.visibleRanges[0];
  const lastVisibleRange = view.visibleRanges[view.visibleRanges.length - 1];
  if (!firstVisibleRange || !lastVisibleRange) {
    return {
      endLineNumber: view.state.doc.lines,
      startLineNumber: 1
    };
  }

  return {
    endLineNumber: view.state.doc.lineAt(Math.max(lastVisibleRange.to - 1, lastVisibleRange.from)).number,
    startLineNumber: view.state.doc.lineAt(firstVisibleRange.from).number
  };
}

export function shouldRefreshLineDecorations(
  update: ViewUpdate,
  previousCursorLineNumber: number | null,
  nextCursorLineNumber: number | null
) {
  if (update.docChanged || update.viewportChanged) {
    return true;
  }

  if (previousCursorLineNumber !== nextCursorLineNumber) {
    return true;
  }

  return false;
}
