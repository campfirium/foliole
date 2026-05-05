import { type EditorView } from '@codemirror/view';

import { pushDebugTrace } from '../../../shared/diagnostics/debugTrace';

export function getEditorLineBlockHeight(view: EditorView, lineNumber: number) {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
    return 0;
  }
  const line = view.state.doc.line(lineNumber);
  return view.lineBlockAt(line.from).height;
}

export function setEditorScrollTop(view: EditorView, scrollTop: number) {
  if (!Number.isFinite(scrollTop)) {
    return;
  }
  pushDebugTrace('editor.viewport.set-scroll-top', {
    nextScrollTop: scrollTop,
    previousScrollTop: view.scrollDOM.scrollTop
  });
  view.scrollDOM.scrollTop = Math.max(0, scrollTop);
}
