import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDrawSelection,
  mockScrollIntoView,
  mockLineWrapping,
  mockUpdateListenerExtension,
  mockHighlightActiveLine,
  mockKeymapOf,
  mockEditorView,
  mockEditorStateCreate
} = vi.hoisted(() => ({
  mockDrawSelection: vi.fn(() => 'draw-selection-extension'),
  mockScrollIntoView: vi.fn(() => 'scroll-into-view-effect'),
  mockLineWrapping: Symbol('lineWrapping'),
  mockUpdateListenerExtension: Symbol('updateListener'),
  mockHighlightActiveLine: vi.fn(() => 'highlight-active-line'),
  mockKeymapOf: vi.fn(() => 'keymap-extension'),
  mockEditorView: vi.fn(),
  mockEditorStateCreate: vi.fn((config) => config)
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: ['default-keymap'],
  history: vi.fn(() => 'history-extension'),
  historyKeymap: ['history-keymap']
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => 'markdown-extension')
}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: mockEditorStateCreate
  }
}));

vi.mock('@codemirror/view', () => ({
  drawSelection: mockDrawSelection,
  EditorView: Object.assign(
    function EditorView(this: Record<string, unknown>, config: unknown) {
      mockEditorView(config);
      this.state = { selection: { main: { from: 0, to: 0 } }, doc: { toString: () => '', length: 0 } };
      this.scrollDOM = { scrollTop: 0, clientHeight: 0, scrollHeight: 0, addEventListener: () => undefined, removeEventListener: () => undefined };
      this.dispatch = () => undefined;
      this.focus = () => undefined;
      this.destroy = () => undefined;
    },
    {
      lineWrapping: mockLineWrapping,
      scrollIntoView: mockScrollIntoView,
      updateListener: {
        of: vi.fn(() => mockUpdateListenerExtension)
      }
    }
  ),
  highlightActiveLine: mockHighlightActiveLine,
  keymap: {
    of: mockKeymapOf
  }
}));

vi.mock('./anchorStructureGuard', () => ({
  anchorStructureGuard: 'anchor-structure-guard',
  bypassAnchorStructureGuard: { of: () => 'bypass-anchor-structure-guard' }
}));

vi.mock('./liveMarkdown', () => ({
  liveMarkdown: 'live-markdown-extension'
}));

vi.mock('./markdownInputAssist', () => ({
  markdownInputAssist: 'markdown-input-assist'
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

describe('CodeMirrorEditorAdapter', () => {
  beforeEach(() => {
    mockDrawSelection.mockClear();
    mockScrollIntoView.mockClear();
    mockEditorStateCreate.mockClear();
    mockEditorView.mockClear();
  });

  it('enables drawn selection so selection highlight stays visible outside native focus', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc'
    });

    expect(mockDrawSelection).toHaveBeenCalledTimes(1);
    const extensions = mockEditorStateCreate.mock.calls[0]?.[0]?.extensions;
    expect(extensions).toContain('draw-selection-extension');
  });

  it('can reveal a document position without changing selection', () => {
    const adapter = new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc'
    });
    const dispatch = vi.fn();
    const focus = vi.fn();

    Object.assign(adapter as object, {
      view: {
        state: { doc: { length: 20 } },
        scrollDOM: {
          addEventListener: () => undefined,
          clientHeight: 200,
          removeEventListener: () => undefined,
          scrollHeight: 500,
          scrollTop: 0
        },
        coordsAtPos: vi.fn(() => null),
        dispatch,
        focus
      }
    });

    adapter.revealPosition(8);

    expect(mockScrollIntoView).toHaveBeenCalledWith(8, { y: 'center' });
    expect(dispatch).toHaveBeenCalledWith({ effects: 'scroll-into-view-effect' });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
