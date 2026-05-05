import type { EditorView, ViewUpdate } from '@codemirror/view';

import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

export interface VisibleLineWindow {
  endLineNumber: number;
  startLineNumber: number;
}

export function resolveVisibleLineWindow(view: EditorView): VisibleLineWindow {
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

export function shouldRefreshLineDecorations(update: ViewUpdate) {
  return (
    update.docChanged ||
    update.viewportChanged ||
    ((update.selectionSet || update.focusChanged) && getMarkdownSyntaxVisibility() === 'visible')
  );
}
