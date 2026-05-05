import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCompartmentReconfigure,
  mockDrawSelection,
  mockScrollIntoView,
  mockLineWrapping,
  mockUpdateListenerExtension,
  mockHighlightActiveLine,
  mockKeymapOf,
  mockDecorationsOf,
  mockDomEventHandlers,
  mockEditorView,
  mockEditorStateCreate,
  mockReadOnlyOf,
  mockEditableOf,
  mockAllowMultipleSelectionsOf,
  mockRangeSetBuilder
} = vi.hoisted(() => ({
  mockCompartmentReconfigure: vi.fn((value: unknown) => value),
  mockDrawSelection: vi.fn(() => 'draw-selection-extension'),
  mockScrollIntoView: vi.fn(() => 'scroll-into-view-effect'),
  mockLineWrapping: Symbol('lineWrapping'),
  mockUpdateListenerExtension: Symbol('updateListener'),
  mockHighlightActiveLine: vi.fn(() => 'highlight-active-line'),
  mockKeymapOf: vi.fn(() => 'keymap-extension'),
  mockDecorationsOf: vi.fn((value) => value),
  mockDomEventHandlers: vi.fn((value) => value),
  mockEditorView: vi.fn(),
  mockEditorStateCreate: vi.fn((config) => config),
  mockReadOnlyOf: vi.fn(() => 'read-only-extension'),
  mockEditableOf: vi.fn(() => 'editable-extension'),
  mockAllowMultipleSelectionsOf: vi.fn(() => 'allow-multiple-selections-extension'),
  mockRangeSetBuilder: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    finish: vi.fn(() => 'paragraph-marker-decorations')
  }))
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
  Compartment: class {
    of(value: unknown) {
      return value;
    }
    reconfigure(value: unknown) {
      return mockCompartmentReconfigure(value);
    }
  },
  EditorState: {
    create: mockEditorStateCreate,
    allowMultipleSelections: {
      of: mockAllowMultipleSelectionsOf
    },
    readOnly: {
      of: mockReadOnlyOf
    }
  },
  RangeSetBuilder: mockRangeSetBuilder
}));

vi.mock('@codemirror/view', () => ({
  Decoration: {
    line: vi.fn((value) => value),
    none: 'decoration-none'
  },
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
      editable: {
        of: mockEditableOf
      },
      decorations: {
        of: mockDecorationsOf
      },
      domEventHandlers: mockDomEventHandlers,
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
  createLiveMarkdown: vi.fn(() => 'live-markdown-extension')
}));

vi.mock('./lineDiffDecorations', () => ({
  buildEditorDiffDecorations: vi.fn(() => 'line-diff-decorations')
}));

vi.mock('./markdownInputAssist', () => ({
  markdownInputAssist: 'markdown-input-assist'
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function resetEditorMocks() {
  mockDrawSelection.mockClear();
  mockCompartmentReconfigure.mockClear();
  mockScrollIntoView.mockClear();
  mockEditorStateCreate.mockClear();
  mockEditorView.mockClear();
  mockDomEventHandlers.mockClear();
  mockReadOnlyOf.mockClear();
  mockEditableOf.mockClear();
  mockAllowMultipleSelectionsOf.mockClear();
}

function createAdapterWithStubbedView() {
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
      lineBlockAt: vi.fn(() => ({ height: 24 })),
      coordsAtPos: vi.fn(() => null),
      dispatch,
      focus
    }
  });

  return { adapter, dispatch, focus };
}

describe('CodeMirrorEditorAdapter construction', () => {
  beforeEach(() => {
    resetEditorMocks();
    vi.useRealTimers();
  });

  it('enables drawn selection so selection highlight stays visible outside native focus', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc'
    });

    expect(mockDrawSelection).toHaveBeenCalledTimes(1);
    expect(mockAllowMultipleSelectionsOf).toHaveBeenCalledWith(true);
    const extensions = mockEditorStateCreate.mock.calls[0]?.[0]?.extensions;
    expect(extensions).toContain('draw-selection-extension');
    expect(extensions).toContain('allow-multiple-selections-extension');
  });

  it('keeps read-only editors selectable so comparison panes can copy text', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc',
      readOnly: true
    });

    expect(mockReadOnlyOf).toHaveBeenCalledWith(true);
    expect(mockEditableOf).toHaveBeenCalledWith(false);
  });
});

describe('CodeMirrorEditorAdapter selection behavior', () => {
  it('can reveal a document position without changing selection', () => {
    const { adapter, dispatch, focus } = createAdapterWithStubbedView();

    adapter.revealPosition(8);

    expect(mockScrollIntoView).toHaveBeenCalledWith(8, { y: 'center' });
    expect(dispatch).toHaveBeenCalledWith({ effects: 'scroll-into-view-effect' });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('can restore selection without forcing focus alignment work', () => {
    const { adapter, dispatch, focus } = createAdapterWithStubbedView();

    adapter.restoreSelection({ from: 8, to: 10 });

    expect(dispatch).toHaveBeenCalledWith({
      scrollIntoView: true,
      selection: { anchor: 8, head: 10 }
    });
    expect(focus).not.toHaveBeenCalled();
  });

  it('can toggle paragraph marker styling on the editor host', () => {
    const host = document.createElement('div');
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'Alpha\nBeta'
    });

    Object.assign(adapter as object, {
      view: {
        dispatch: vi.fn(),
        dom: host,
        state: {
          doc: {
            length: 10,
            line: (lineNumber: number) => (lineNumber === 1 ? { from: 0 } : { from: 6 }),
            lineAt: (position: number) => (position <= 5 ? { from: 0, number: 1 } : { from: 6, number: 2 })
          }
        }
      }
    });

    adapter.setParagraphMarker({ from: 0, to: 5 });
    expect(host.dataset.paragraphMarkerActive).toBe('true');

    adapter.setParagraphMarker(null);
    expect(host.dataset.paragraphMarkerActive).toBe('false');
  });
});
