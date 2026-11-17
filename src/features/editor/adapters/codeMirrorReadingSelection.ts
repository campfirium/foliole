import { Compartment, StateEffect } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import type { EditorSelection } from './EditorAdapter';

const readingSelection = new Compartment();
const selectionMark = Decoration.mark({ class: 'cm-md-reading-selection' });

export function setCodeMirrorReadingSelection(view: EditorView, range: EditorSelection | null) {
  const to = range ? Math.min(range.to, view.state.doc.length) : 0;
  const decorations = range && range.from >= 0 && to > range.from
    ? Decoration.set([selectionMark.range(range.from, to)]) : Decoration.none;
  const extension = EditorView.decorations.of(decorations);
  view.dispatch({ effects: readingSelection.get(view.state)
    ? readingSelection.reconfigure(extension) : StateEffect.appendConfig.of(readingSelection.of(extension)) });
}
