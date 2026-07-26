import { describe, expect, it, vi } from 'vitest';

const { mockContentAttributesOf, mockEditorAttributesOf, mockReadOnlyOf } = vi.hoisted(() => ({
  mockContentAttributesOf: vi.fn((value) => ({ contentAttributes: value })),
  mockEditorAttributesOf: vi.fn((value) => ({ editorAttributes: value })),
  mockReadOnlyOf: vi.fn((value) => ({ readOnly: value }))
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  toggleComment: vi.fn()
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => 'markdown'),
  markdownLanguage: {}
}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    allowMultipleSelections: { of: vi.fn(() => 'multiple-selections') },
    readOnly: { of: mockReadOnlyOf }
  },
  RangeSetBuilder: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    finish: vi.fn(() => [])
  })),
  StateEffect: {
    define: vi.fn(() => ({ of: vi.fn((value) => value) }))
  },
  StateField: {
    define: vi.fn((value) => value)
  }
}));

vi.mock('@codemirror/view', () => ({
  Decoration: {
    mark: vi.fn((value) => value),
    none: 'none',
    set: vi.fn((value) => value)
  },
  EditorView: {
    contentAttributes: { of: mockContentAttributesOf },
    editorAttributes: { of: mockEditorAttributesOf },
    decorations: { of: vi.fn((value) => value) },
    domEventHandlers: vi.fn((value) => value),
    editable: { of: vi.fn((value) => ({ editable: value })) },
    lineWrapping: 'line-wrapping',
    updateListener: { of: vi.fn((value) => value) }
  },
  highlightActiveLine: vi.fn(() => 'active-line'),
  keymap: { of: vi.fn((value) => value) },
  WidgetType: class {}
}));

vi.mock('./liveMarkdown', () => ({
  createLiveMarkdownExtensions: vi.fn(() => [])
}));

vi.mock('./liveMarkdownState', () => ({
  createLiveMarkdownStateExtensions: vi.fn(() => []),
  trailingDividerFacet: { of: vi.fn((value) => value) }
}));

vi.mock('./liveMarkdownTrailingDivider', () => ({
  trailingDividerExtension: 'trailing-divider'
}));

vi.mock('./markdownInputAssist', () => ({
  markdownInputAssist: 'input-assist'
}));

vi.mock('../model/folioleMarkdownParser', () => ({
  folioleMarkdownLanguageExtensions: []
}));

import { createCodeMirrorEditorExtensions } from './codeMirrorEditorAdapterConfig';

function compartment() {
  return {
    of: (value: unknown) => value
  } as never;
}

describe('CodeMirror mobile read-only mode', () => {
  it('keeps document read-only content out of the editable focus order', () => {
    createCodeMirrorEditorExtensions({
      diffDecorationsCompartment: compartment(),
      hideTitleHeading: false,
      imageClozePresentationVersion: 0,
      liveMarkdownCompartment: compartment(),
      liveMarkdownStateCompartment: compartment(),
      nodeId: 'node-1',
      onCompositionEnd: vi.fn(),
      onDocChanged: vi.fn(),
      options: {
        initialContent: 'Alpha',
        readOnly: true,
        readOnlyInteractionMode: 'document'
      },
      paragraphMarkerCompartment: compartment(),
      readOnlyCompartment: compartment(),
      searchDecorationsCompartment: compartment(),
      textAnchorDecorations: [],
      textAnchorDecorationsCompartment: compartment()
    });

    expect(mockReadOnlyOf).toHaveBeenCalledWith(true);
    expect(mockEditorAttributesOf).toHaveBeenCalledWith({
      'aria-readonly': 'true',
      role: 'document',
      tabindex: '-1'
    });
    expect(mockContentAttributesOf).toHaveBeenCalledWith({
      'aria-readonly': 'true',
      inputmode: 'none',
      role: 'document',
      tabindex: '-1'
    });
  });
});
