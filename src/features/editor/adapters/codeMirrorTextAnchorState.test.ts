import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import {
  createTextAnchorDecorationsExtension,
  updateTextAnchorDecorations
} from './codeMirrorTextAnchorState';

function getHighlightedText(view: EditorView) {
  return view.contentDOM.querySelector('.cm-md-highlight')?.textContent ?? null;
}

function getHighlightElement(view: EditorView) {
  return view.contentDOM.querySelector('.cm-md-highlight');
}

function createEditorView(doc: string, decorations: Array<{ from: number; kind: 'highlight'; to: number }>) {
  const host = document.createElement('div');
  return new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        createTextAnchorDecorationsExtension(decorations)
      ]
    })
  });
}

function dispatchPrefixInsert(view: EditorView) {
  view.dispatch({
    changes: {
      from: 0,
      insert: 'X '
    }
  });
}

describe('codeMirrorTextAnchorState', () => {
  it('maps highlight decorations through document changes before store sync catches up', () => {
    const view = createEditorView('Alpha Beta', [
      { from: 6, kind: 'highlight', to: 10 }
    ]);

    try {
      const initialHighlightElement = getHighlightElement(view);
      expect(initialHighlightElement?.textContent).toBe('Beta');

      dispatchPrefixInsert(view);

      expect(getHighlightedText(view)).toBe('Beta');
      const mappedHighlightElement = getHighlightElement(view);
      expect(mappedHighlightElement).not.toBeNull();

      updateTextAnchorDecorations({
        textAnchorDecorations: [{ from: 8, kind: 'highlight', to: 12 }],
        view
      });

      expect(getHighlightedText(view)).toBe('Beta');
      expect(getHighlightElement(view)).toBe(mappedHighlightElement);
    } finally {
      view.destroy();
    }
  });

  it('normalizes out-of-range highlight positions before mapping document changes', () => {
    const view = createEditorView('Short text', [
      { from: 148, kind: 'highlight', to: 160 }
    ]);

    try {
      expect(() => dispatchPrefixInsert(view)).not.toThrow();
    } finally {
      view.destroy();
    }
  });
});
