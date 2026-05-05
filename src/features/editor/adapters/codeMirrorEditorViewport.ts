import { type EditorView } from '@codemirror/view';

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
  view.scrollDOM.scrollTop = Math.max(0, scrollTop);
}
