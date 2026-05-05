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

describe('codeMirrorTextAnchorState', () => {
  it('maps highlight decorations through document changes before store sync catches up', () => {
    const host = document.createElement('div');
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: 'Alpha Beta',
        extensions: [
          createTextAnchorDecorationsExtension([
            { from: 6, kind: 'highlight', to: 10 }
          ])
        ]
      })
    });

    try {
      const initialHighlightElement = getHighlightElement(view);
      expect(initialHighlightElement?.textContent).toBe('Beta');

      view.dispatch({
        changes: {
          from: 0,
          insert: 'X '
        }
      });

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
});
