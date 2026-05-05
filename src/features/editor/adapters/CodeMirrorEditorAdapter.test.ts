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
  mockEditorView,
  mockEditorStateCreate,
  mockReadOnlyOf,
  mockEditableOf
} = vi.hoisted(() => ({
  mockCompartmentReconfigure: vi.fn((value: unknown) => value),
  mockDrawSelection: vi.fn(() => 'draw-selection-extension'),
  mockScrollIntoView: vi.fn(() => 'scroll-into-view-effect'),
  mockLineWrapping: Symbol('lineWrapping'),
  mockUpdateListenerExtension: Symbol('updateListener'),
  mockHighlightActiveLine: vi.fn(() => 'highlight-active-line'),
  mockKeymapOf: vi.fn(() => 'keymap-extension'),
  mockDecorationsOf: vi.fn((value) => value),
  mockEditorView: vi.fn(),
  mockEditorStateCreate: vi.fn((config) => config),
  mockReadOnlyOf: vi.fn(() => 'read-only-extension'),
  mockEditableOf: vi.fn(() => 'editable-extension')
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
    readOnly: {
      of: mockReadOnlyOf
    }
  }
}));

vi.mock('@codemirror/view', () => ({
  Decoration: {
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
import { shouldRefreshLineDecorations } from './liveMarkdownViewport';

function resetEditorMocks() {
  mockDrawSelection.mockClear();
  mockCompartmentReconfigure.mockClear();
  mockScrollIntoView.mockClear();
  mockEditorStateCreate.mockClear();
  mockEditorView.mockClear();
  mockReadOnlyOf.mockClear();
  mockEditableOf.mockClear();
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

describe('CodeMirrorEditorAdapter', () => {
  beforeEach(() => {
    resetEditorMocks();
  });

  it('enables drawn selection so selection highlight stays visible outside native focus', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc'
    });

    expect(mockDrawSelection).toHaveBeenCalledTimes(1);
    const extensions = mockEditorStateCreate.mock.calls[0]?.[0]?.extensions;
    expect(extensions).toContain('draw-selection-extension');
  });

  it('keeps read-only editors selectable so comparison panes can copy text', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc',
      readOnly: true
    });

    expect(mockReadOnlyOf).toHaveBeenCalledWith(true);
    expect(mockEditableOf).toHaveBeenCalledWith(true);
  });

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
});

describe('shouldRefreshLineDecorations', () => {
  it('refreshes line decorations when focus changes so cursor-line image previews can update', () => {
    expect(
      shouldRefreshLineDecorations({
        docChanged: false,
        focusChanged: true,
        selectionSet: false,
        viewportChanged: false
      } as never, 12, null)
    ).toBe(true);
  });

  it('skips line decoration rebuild when selection changes inside the same line', () => {
    expect(
      shouldRefreshLineDecorations({
        docChanged: false,
        focusChanged: false,
        selectionSet: true,
        viewportChanged: false
      } as never, 12, 12)
    ).toBe(false);
  });

  it('refreshes line decorations when selection moves to another line', () => {
    expect(
      shouldRefreshLineDecorations({
        docChanged: false,
        focusChanged: false,
        selectionSet: true,
        viewportChanged: false
      } as never, 12, 13)
    ).toBe(true);
  });
});
