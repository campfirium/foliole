import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function withAdapter(run: (adapter: CodeMirrorEditorAdapter, view: EditorView) => void, content = 'x'.repeat(818)) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });
  const view = (adapter as unknown as { view: EditorView }).view;
  try {
    run(adapter, view);
  } finally {
    adapter.destroy();
    host.remove();
  }
}

describe('external replacement of a longer editor document', () => {
  it('opens a complete bounded body part containing a long Unicode paragraph', () => {
    const content = '中文😀'.repeat(104_857);
    withAdapter((adapter) => {
      expect(adapter.getContent()).toBe(content);
    }, content);
  });

  it('keeps a search match on its text when content is inserted before it', () => {
    withAdapter((adapter, view) => {
      adapter.setSearchDecorations({ activeIndex: 0, matches: [{ from: 6, to: 12 }] });
      view.dispatch({ changes: { from: 0, insert: 'X ' } });
      expect(view.contentDOM.querySelector('.cm-topic-search-match-active')?.textContent).toBe('NEEDLE');
    }, 'Start NEEDLE End');
  });

  it.each([
    { oldLength: 818, matchFrom: 800, newLength: 727 },
    { oldLength: 3410, matchFrom: 3390, newLength: 195 }
  ])('keeps the editor usable with search decorations after $oldLength to $newLength replacement', ({ oldLength, matchFrom, newLength }) => {
    withAdapter((adapter, view) => {
      adapter.setSearchDecorations({ activeIndex: 0, matches: [{ from: matchFrom, to: oldLength }] });
      adapter.setContent('x'.repeat(newLength));
      expect(() => view.dispatch({ changes: { from: 0, insert: 'a' } })).not.toThrow();
      expect(adapter.getContent()).toHaveLength(newLength + 1);
    }, 'x'.repeat(oldLength));
  });

  it('keeps the editor usable with line markers from a longer multiline document', () => {
    const content = 'line\n'.repeat(170);
    withAdapter((adapter, view) => {
      adapter.setParagraphMarker({ from: 800, to: 818 });
      adapter.setContent('x'.repeat(727));
      expect(() => view.dispatch({ changes: { from: 0, insert: 'a' } })).not.toThrow();
    }, content);
  });

  it('keeps the editor usable with diff decorations from the longer document', () => {
    withAdapter((adapter, view) => {
      adapter.setDiffDecorations({
        lineDecorations: [],
        spacerDecorations: [{ beforeLineNumber: 2, kind: 'added', lines: [] }]
      });
      adapter.setContent('x'.repeat(727));
      expect(() => view.dispatch({ changes: { from: 0, insert: 'a' } })).not.toThrow();
      expect(adapter.getContent()).toHaveLength(728);
    });
  });
});
