import { vi } from 'vitest';

const {
  mockCompartmentReconfigure,
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
  mockMarkdown,
  mockRangeSetBuilder,
  mockFacetDefine,
  mockStateEffectDefine,
  mockStateFieldDefine
} = vi.hoisted(() => ({
  mockMarkdown: vi.fn(() => 'markdown-extension'),
  mockCompartmentReconfigure: vi.fn((value: unknown) => value),
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
  mockFacetDefine: vi.fn(() => ({
    facet: 'mock-facet',
    of: vi.fn((value) => value)
  })),
  mockStateEffectDefine: vi.fn(() => ({
    of: vi.fn((value) => value)
  })),
  mockStateFieldDefine: vi.fn((value) => value),
  mockRangeSetBuilder: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    finish: vi.fn(() => 'paragraph-marker-decorations')
  }))
}));

vi.mock('@codemirror/commands', () => ({
  history: vi.fn(() => []),
  invertedEffects: { of: vi.fn() },
  defaultKeymap: ['default-keymap'],
  redo: vi.fn(),
  toggleComment: vi.fn(),
  undo: vi.fn()
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: mockMarkdown,
  markdownLanguage: {
    parser: {
      configure: vi.fn(() => 'foliole-markdown-parser')
    }
  }
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
  Facet: {
    define: mockFacetDefine
  },
  Prec: {
    highest: vi.fn((value) => value)
  },
  StateEffect: {
    define: mockStateEffectDefine
  },
  StateField: {
    define: mockStateFieldDefine
  },
  EditorState: {
    create: mockEditorStateCreate,
    allowMultipleSelections: {
      of: mockAllowMultipleSelectionsOf
    },
    readOnly: {
      of: mockReadOnlyOf
    },
    transactionFilter: { of: vi.fn((value) => value) }
  },
  RangeSetBuilder: mockRangeSetBuilder
}));

vi.mock('@codemirror/view', () => ({
  ViewPlugin: { fromClass: vi.fn(() => 'pending-image-pastes') },
  Decoration: {
    line: vi.fn((value) => value),
    mark: vi.fn((value) => value),
    none: 'decoration-none',
    set: vi.fn((value) => value),
    widget: vi.fn((value) => ({ range: vi.fn((position) => ({ position, value })) }))
  },
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
        from: vi.fn((field, value) => ({ field, value })),
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
  },
  WidgetType: class {}
}));

vi.mock('./liveMarkdown', () => ({
  createLiveMarkdownExtensions: vi.fn(() => 'live-markdown-extension')
}));

vi.mock('./lineDiffDecorations', () => ({
  buildEditorDiffDecorations: vi.fn(() => 'line-diff-decorations'),
  editorDiffDecorationsStateField: 'diff-decoration-state-field',
  setEditorDiffDecorationsEffect: { of: vi.fn((value) => value) }
}));

vi.mock('./markdownInputAssist', () => ({
  markdownInputAssist: 'markdown-input-assist'
}));

export {
  mockMarkdown,
  mockAllowMultipleSelectionsOf,
  mockCompartmentReconfigure,
  mockDomEventHandlers,
  mockEditableOf,
  mockEditorStateCreate,
  mockEditorView,
  mockReadOnlyOf,
  mockScrollIntoView
};
