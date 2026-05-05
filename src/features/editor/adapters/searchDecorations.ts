import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { EditorSearchDecorations, EditorSelection } from './EditorAdapter';

function addSearchDecoration(
  builder: RangeSetBuilder<Decoration>,
  match: EditorSelection,
  className: string,
  maxLength: number
) {
  const from = Math.max(0, Math.min(match.from, maxLength));
  const to = Math.max(from, Math.min(match.to, maxLength));
  if (from === to) {
    return;
  }
  builder.add(from, to, Decoration.mark({ class: className }));
}

export function buildEditorSearchDecorations(
  view: EditorView,
  config: EditorSearchDecorations | null | undefined
): DecorationSet {
  if (!config || config.matches.length === 0) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const maxLength = view.state.doc.length;

  config.matches.forEach((match, index) => {
    addSearchDecoration(
      builder,
      match,
      index === config.activeIndex ? 'cm-topic-search-match-active' : 'cm-topic-search-match',
      maxLength
    );
  });

  return builder.finish();
}
