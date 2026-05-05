import { type EditorView } from '@codemirror/view';

import { alignSelectionInViewport } from './codeMirrorEditorAdapterView';
import type { EditorSelection } from './EditorAdapter';

export function revealEditorSelection(view: EditorView, selection: EditorSelection, clampPosition: (position: number) => number) {
  const anchor = clampPosition(selection.from);
  const head = clampPosition(selection.to);
  view.dispatch({
    selection: { anchor, head },
    scrollIntoView: true
  });
  view.focus();
  alignSelectionInViewport(view, anchor);
}

export function restoreEditorSelection(view: EditorView, selection: EditorSelection, clampPosition: (position: number) => number) {
  view.dispatch({
    selection: {
      anchor: clampPosition(selection.from),
      head: clampPosition(selection.to)
    },
    scrollIntoView: true
  });
}
