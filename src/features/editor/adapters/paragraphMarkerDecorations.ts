import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { EditorSelection } from './EditorAdapter';

function clampSelection(selection: EditorSelection, maxLength: number) {
  const from = Math.max(0, Math.min(selection.from, selection.to, maxLength));
  const to = Math.max(0, Math.min(Math.max(selection.from, selection.to), maxLength));
  return { from, to };
}

export function buildParagraphMarkerDecorations(
  view: EditorView,
  selection: EditorSelection | null | undefined
): DecorationSet {
  if (!selection) {
    return Decoration.none;
  }

  const { from, to } = clampSelection(selection, view.state.doc.length);
  if (from === to) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  let lineNumber = view.state.doc.lineAt(from).number;
  const lastLineNumber = view.state.doc.lineAt(Math.max(from, to - 1)).number;

  while (lineNumber <= lastLineNumber) {
    const line = view.state.doc.line(lineNumber);
    builder.add(line.from, line.from, Decoration.line({ attributes: { class: 'cm-paragraph-marker-line' } }));
    lineNumber += 1;
  }

  return builder.finish();
}
