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

function createEditorView(doc: string, decorations: Array<{ from: number; kind: 'cloze' | 'highlight'; to: number }>) {
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

function dispatchInsert(view: EditorView, from: number, insert: string) {
  view.dispatch({
    changes: {
      from,
      insert
    }
  });
}

function withHighlightView(doc: string, run: (view: EditorView) => void) {
  const view = createEditorView(doc, [{ from: 6, kind: 'highlight', to: 10 }]);
  try {
    run(view);
  } finally {
    view.destroy();
  }
}

function registerChangeMappingTest() {
  it('maps highlight decorations through document changes before store sync catches up', () => {
    withHighlightView('Alpha Beta', (view) => {
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
    });
  });
}

function registerOutOfRangeNormalizationTest() {
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
}

function registerBoundaryInsertionTests() {
  it('keeps text inserted before a highlight outside the highlight', () => {
    withHighlightView('Alpha Beta', (view) => {
      dispatchInsert(view, 6, 'New ');

      const highlightElement = getHighlightElement(view);
      expect(highlightElement?.textContent).toBe('Beta');
      expect(view.state.doc.toString()).toBe('Alpha New Beta');
    });
  });

  it('keeps text inserted after a highlight outside the highlight', () => {
    withHighlightView('Alpha Beta.', (view) => {
      dispatchInsert(view, 10, ' plus');

      const highlightElement = getHighlightElement(view);
      expect(highlightElement?.textContent).toBe('Beta');
      expect(view.state.doc.toString()).toBe('Alpha Beta plus.');
    });
  });

  it('keeps text inserted inside a highlight within the highlight', () => {
    withHighlightView('Alpha Beta', (view) => {
      dispatchInsert(view, 8, 'X');

      const highlightElement = getHighlightElement(view);
      expect(highlightElement?.textContent).toBe('BeXta');
      expect(view.state.doc.toString()).toBe('Alpha BeXta');
    });
  });
}

function registerOverlapTests() {
  it('renders overlapping highlight and cloze decorations in normal text', () => {
    const view = createEditorView('Alpha Beta Gamma', [
      { from: 6, kind: 'highlight', to: 16 },
      { from: 11, kind: 'cloze', to: 16 }
    ]);

    try {
      expect(view.contentDOM.querySelector('.cm-md-highlight')?.textContent).toBe('Beta ');
      expect(view.contentDOM.querySelector('.cm-md-cloze')?.textContent).toBe('Gamma');
      expect(view.contentDOM.querySelector('.cm-md-anchor-overlap')?.textContent).toBe('Gamma');
    } finally {
      view.destroy();
    }
  });
}

describe('codeMirrorTextAnchorState', () => {
  registerChangeMappingTest();
  registerOutOfRangeNormalizationTest();
  registerBoundaryInsertionTests();
  registerOverlapTests();
});
