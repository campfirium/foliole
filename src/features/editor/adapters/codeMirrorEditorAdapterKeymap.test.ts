import { describe, expect, it, vi } from 'vitest';

const mockKeymapOf = vi.hoisted(() => vi.fn((value) => value));
const mockCreateLiveMarkdownExtensions = vi.hoisted(() => vi.fn(() => 'live-markdown-extensions'));
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
  markdownLanguage: {
    parser: {
      configure: vi.fn(() => 'foliole-markdown-parser')
    }
  }
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

vi.mock('../model/folioleMarkdownParser', () => ({
  folioleMarkdownLanguageExtensions: []
}));

vi.mock('./codeMirrorEditorAdapterSupport', () => ({
  createLiveMarkdownReconfigureEffect: vi.fn(),
  createReadOnlyExtensions: vi.fn(() => 'read-only-extensions')
}));

vi.mock('./codeMirrorTextAnchorState', () => ({
  createTextAnchorDecorationsExtension: vi.fn(() => 'text-anchor-decorations')
}));

vi.mock('./liveMarkdown', () => ({
  createLiveMarkdownExtensions: mockCreateLiveMarkdownExtensions
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

function createEditorExtensionArgs(options: { initialContent: string; liveMarkdownEnabled?: boolean } = { initialContent: 'abc' }) {
  return {
    diffDecorationsCompartment: createCompartment() as never,
    hideTitleHeading: false,
    imageClozePresentationVersion: 0,
    liveMarkdownCompartment: createCompartment() as never,
    liveMarkdownStateCompartment: createCompartment() as never,
    nodeId: 'node-1',
    onCompositionEnd: vi.fn(),
    onDocChanged: vi.fn(),
    options,
    paragraphMarkerCompartment: createCompartment() as never,
    readOnlyCompartment: createCompartment() as never,
    searchDecorationsCompartment: createCompartment() as never,
    textAnchorDecorations: [],
    textAnchorDecorationsCompartment: createCompartment() as never
  };
}

describe('CodeMirror editor keymap', () => {
  beforeEach(() => {
    mockCreateLiveMarkdownExtensions.mockClear();
    mockKeymapOf.mockClear();
  });

  it('does not install CodeMirror history or bind its history keymap', () => {
    const extensions = createCodeMirrorEditorExtensions(createEditorExtensionArgs());

    expect(mockKeymapOf).toHaveBeenCalledWith([{ key: 'Mod-a', run: expect.any(Function) }]);
    expect(extensions).not.toContain('history-extension');
  });

  it('does not install CodeMirror comment toggling shortcut', () => {
    createCodeMirrorEditorExtensions(createEditorExtensionArgs());

    const installedKeymap = mockKeymapOf.mock.calls.at(-1)?.[0] ?? [];
    expect(installedKeymap).not.toContainEqual({ key: 'Mod-/', run: mockToggleComment });
  });

  it('can skip live markdown decorations for lightweight local-file editing', () => {
    const liveMarkdownCompartment = createCompartment();
    const args = createEditorExtensionArgs({ initialContent: 'abc', liveMarkdownEnabled: false });
    const extensions = createCodeMirrorEditorExtensions({ ...args, liveMarkdownCompartment: liveMarkdownCompartment as never });

    expect(mockCreateLiveMarkdownExtensions).not.toHaveBeenCalled();
    expect(liveMarkdownCompartment.of).toHaveBeenCalledWith([]);
    expect(extensions).not.toContain('live-markdown-extensions');
  });

});
