import { describe, expect, it, vi } from 'vitest';

const mockKeymapOf = vi.hoisted(() => vi.fn((value) => value));
const mockToggleComment = vi.hoisted(() => vi.fn());

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [
    { key: 'Mod-a', run: vi.fn() },
    { key: 'Mod-/', run: mockToggleComment }
  ],
  toggleComment: mockToggleComment
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => 'markdown-extension'),
  markdownLanguage: {}
}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    allowMultipleSelections: { of: vi.fn(() => 'allow-multiple-selections') }
  }
}));

vi.mock('@codemirror/view', () => ({
  Decoration: { none: 'decoration-none' },
  EditorView: {
    decorations: { of: vi.fn((value) => value) },
    domEventHandlers: vi.fn((value) => value),
    lineWrapping: 'line-wrapping',
    updateListener: { of: vi.fn((value) => value) }
  },
  highlightActiveLine: vi.fn(() => 'highlight-active-line'),
  keymap: { of: mockKeymapOf }
}));

vi.mock('../model/markdownOblikeExtension', () => ({
  folioleMarkdownExtensions: []
}));

vi.mock('./codeMirrorEditorAdapterSupport', () => ({
  createLiveMarkdownReconfigureEffect: vi.fn(),
  createReadOnlyExtensions: vi.fn(() => 'read-only-extensions')
}));

vi.mock('./codeMirrorTextAnchorState', () => ({
  createTextAnchorDecorationsExtension: vi.fn(() => 'text-anchor-decorations')
}));

vi.mock('./liveMarkdown', () => ({
  createLiveMarkdownExtensions: vi.fn(() => 'live-markdown-extensions')
}));

vi.mock('./liveMarkdownState', () => ({
  createLiveMarkdownStateExtensions: vi.fn(() => 'live-markdown-state-extensions'),
  trailingDividerFacet: { of: vi.fn((value) => value) }
}));

vi.mock('./liveMarkdownTrailingDivider', () => ({
  trailingDividerExtension: 'trailing-divider-extension'
}));

vi.mock('./markdownInputAssist', () => ({
  markdownInputAssist: 'markdown-input-assist'
}));

import { createCodeMirrorEditorExtensions } from './codeMirrorEditorAdapterConfig';

function createCompartment() {
  return { of: vi.fn((value) => value) };
}

describe('CodeMirror editor keymap', () => {
  it('does not install CodeMirror history or bind its history keymap', () => {
    const extensions = createCodeMirrorEditorExtensions({
      diffDecorationsCompartment: createCompartment() as never,
      hideTitleHeading: false,
      imageClozePresentationVersion: 0,
      liveMarkdownCompartment: createCompartment() as never,
      liveMarkdownStateCompartment: createCompartment() as never,
      nodeId: 'node-1',
      onCompositionEnd: vi.fn(),
      onDocChanged: vi.fn(),
      options: { initialContent: 'abc' },
      paragraphMarkerCompartment: createCompartment() as never,
      readOnlyCompartment: createCompartment() as never,
      searchDecorationsCompartment: createCompartment() as never,
      textAnchorDecorations: [],
      textAnchorDecorationsCompartment: createCompartment() as never
    });

    expect(mockKeymapOf).toHaveBeenCalledWith([{ key: 'Mod-a', run: expect.any(Function) }]);
    expect(extensions).not.toContain('history-extension');
  });

  it('does not install CodeMirror comment toggling shortcut', () => {
    createCodeMirrorEditorExtensions({
      diffDecorationsCompartment: createCompartment() as never,
      hideTitleHeading: false,
      imageClozePresentationVersion: 0,
      liveMarkdownCompartment: createCompartment() as never,
      liveMarkdownStateCompartment: createCompartment() as never,
      nodeId: 'node-1',
      onCompositionEnd: vi.fn(),
      onDocChanged: vi.fn(),
      options: { initialContent: 'abc' },
      paragraphMarkerCompartment: createCompartment() as never,
      readOnlyCompartment: createCompartment() as never,
      searchDecorationsCompartment: createCompartment() as never,
      textAnchorDecorations: [],
      textAnchorDecorationsCompartment: createCompartment() as never
    });

    const installedKeymap = mockKeymapOf.mock.calls.at(-1)?.[0] ?? [];
    expect(installedKeymap).not.toContainEqual({ key: 'Mod-/', run: mockToggleComment });
  });
});
