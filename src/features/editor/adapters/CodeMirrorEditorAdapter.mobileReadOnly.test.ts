import { describe, expect, it, vi } from 'vitest';

const { mockContentAttributesOf, mockEditorAttributesOf, mockReadOnlyOf } = vi.hoisted(() => ({
  mockContentAttributesOf: vi.fn(),
  mockEditorAttributesOf: vi.fn(),
  mockReadOnlyOf: vi.fn()
}));

vi.mock('@codemirror/commands', async importOriginal => ({
  ...await importOriginal<typeof import('@codemirror/commands')>(),
  defaultKeymap: [],
  toggleComment: vi.fn()
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => 'markdown'),
  markdownLanguage: {
    parser: {
      configure: vi.fn(() => 'foliole-markdown-parser')
    }
  }
}));

vi.mock('@codemirror/state', async importOriginal => {
  const actual = await importOriginal<typeof import('@codemirror/state')>();
  mockReadOnlyOf.mockImplementation(actual.EditorState.readOnly.of.bind(actual.EditorState.readOnly));
  vi.spyOn(actual.EditorState.readOnly, 'of').mockImplementation(mockReadOnlyOf);
  return actual;
});

vi.mock('@codemirror/view', async importOriginal => {
  const actual = await importOriginal<typeof import('@codemirror/view')>();
  mockContentAttributesOf.mockImplementation(actual.EditorView.contentAttributes.of.bind(actual.EditorView.contentAttributes));
  mockEditorAttributesOf.mockImplementation(actual.EditorView.editorAttributes.of.bind(actual.EditorView.editorAttributes));
  vi.spyOn(actual.EditorView.contentAttributes, 'of').mockImplementation(mockContentAttributesOf);
  vi.spyOn(actual.EditorView.editorAttributes, 'of').mockImplementation(mockEditorAttributesOf);
  return actual;
});

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
