import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockKeymapOf = vi.hoisted(() => vi.fn((value) => value));
const mockDomEventHandlers = vi.hoisted(() => vi.fn((value) => value));
const mockCreateLiveMarkdownExtensions = vi.hoisted(() => vi.fn(() => 'live-markdown-extensions'));
const mockRedo = vi.hoisted(() => vi.fn());
const mockToggleComment = vi.hoisted(() => vi.fn());
const mockUndo = vi.hoisted(() => vi.fn());

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [
    { key: 'Mod-z', run: mockUndo },
    { key: 'Mod-y', run: mockRedo },
    { key: 'Mod-a', run: vi.fn() },
    { key: 'Mod-/', run: mockToggleComment }
  ],
  redo: mockRedo,
  undo: mockUndo,
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
  },
  StateEffect: {
    define: vi.fn(() => ({ of: vi.fn((value) => value) }))
  },
  StateField: {
    define: vi.fn((value) => value)
  }
}));

vi.mock('@codemirror/view', () => ({
  Decoration: { none: 'decoration-none' },
  EditorView: {
    decorations: { of: vi.fn((value) => value) },
    domEventHandlers: mockDomEventHandlers,
    lineWrapping: 'line-wrapping',
    updateListener: { of: vi.fn((value) => value) }
  },
  highlightActiveLine: vi.fn(() => 'highlight-active-line'),
  keymap: { of: mockKeymapOf },
  WidgetType: class {}
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

function createEditorExtensionArgs(options: {
  initialContent: string;
  liveMarkdownEnabled?: boolean;
  onRedo?: () => boolean;
  onUndo?: () => boolean;
} = { initialContent: 'abc' }) {
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

beforeEach(() => {
  mockDomEventHandlers.mockClear();
  mockCreateLiveMarkdownExtensions.mockClear();
  mockKeymapOf.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CodeMirror editor keymap', () => {
  it('does not install CodeMirror history or bind its history keymap', () => {
    const extensions = createCodeMirrorEditorExtensions(createEditorExtensionArgs());

    expect(mockKeymapOf).toHaveBeenCalledWith([
      { key: 'Escape', run: expect.any(Function) },
      { key: 'Mod-b', run: expect.any(Function) },
      { key: 'Mod-i', run: expect.any(Function) },
      { key: 'Mod-a', run: expect.any(Function) }
    ]);
    expect(extensions).not.toContain('history-extension');
  });

  it('leaves undo and redo routing to the configurable app command map', () => {
    createCodeMirrorEditorExtensions(createEditorExtensionArgs());
    const installedKeymap = mockKeymapOf.mock.calls.at(-1)?.[0] ?? [];

    expect(installedKeymap.some((binding: { run?: unknown }) => binding.run === mockUndo)).toBe(false);
    expect(installedKeymap.some((binding: { run?: unknown }) => binding.run === mockRedo)).toBe(false);
  });

  it('does not install CodeMirror comment toggling shortcut', () => {
    createCodeMirrorEditorExtensions(createEditorExtensionArgs());

    const installedKeymap = mockKeymapOf.mock.calls.at(-1)?.[0] ?? [];
    expect(installedKeymap).not.toContainEqual({ key: 'Mod-/', run: mockToggleComment });
  });

  it('binds conventional inline formatting shortcuts for every desktop platform', () => {
    createCodeMirrorEditorExtensions(createEditorExtensionArgs());
    const installedKeymap = mockKeymapOf.mock.calls.at(-1)?.[0] ?? [];

    expect(installedKeymap.some((binding: { key?: string }) => binding.key === 'Mod-b')).toBe(true);
    expect(installedKeymap.some((binding: { key?: string }) => binding.key === 'Mod-i')).toBe(true);
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

describe('CodeMirror editor Escape blur', () => {
  it('blurs CodeMirror Escape even if focus returns after the event', () => {
    vi.useFakeTimers();
    createCodeMirrorEditorExtensions(createEditorExtensionArgs());
    const handlers = mockDomEventHandlers.mock.calls.at(-1)?.[0] ?? {};
    const host = document.createElement('div');
    const content = document.createElement('div');
    content.tabIndex = 0;
    host.append(content);
    document.body.append(host);
    content.focus();

    const wasHandled = handlers.keydown(new KeyboardEvent('keydown', { key: 'Escape' }), { dom: host });
    content.focus();
    vi.runOnlyPendingTimers();

    expect(wasHandled).toBe(false);
    expect(document.activeElement).not.toBe(content);
    host.remove();
  });

  it('binds Escape to blur the focused CodeMirror content', () => {
    vi.useFakeTimers();
    createCodeMirrorEditorExtensions(createEditorExtensionArgs());
    const escapeBinding = mockKeymapOf.mock.calls.at(-1)?.[0]?.find((binding: { key?: string }) => binding.key === 'Escape');
    const host = document.createElement('div');
    const content = document.createElement('div');
    content.tabIndex = 0;
    host.append(content);
    document.body.append(host);
    content.focus();

    const wasHandled = escapeBinding?.run({ dom: host });
    content.focus();
    vi.runOnlyPendingTimers();

    expect(wasHandled).toBe(true);
    expect(document.activeElement).not.toBe(content);
    host.remove();
  });
});
