import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

afterEach(() => {
  document.body.replaceChildren();
});

function createEditorAdapter(content = 'Alpha Beta') {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => content),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 0, to: 5 })),
    getSelectionRanges: vi.fn(() => [{ from: 0, to: 5 }]),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn(),
    setSelectionRanges: vi.fn()
  };
}

function buildHookArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeNode: { id: 'node-1', content: 'Alpha Beta', title: 'Alpha Beta' } as never,
    activeNodeId: 'node-1',
    createChildNode: vi.fn(() => 'child-note'),
    createHighlightNodeFromSelection: vi.fn(() => 'highlight-1'),
    createQANodeFromSelection: vi.fn(() => 'qa-1'),
    deleteImageClozeRegion: vi.fn(),
    deleteEditorAnnotationNodes: vi.fn(),
    editorRef: { current: createEditorAdapter() },
    flushPendingEditorDraft: vi.fn(() => false),
    isTrashViewOpen: false,
    nodesById: { 'node-1': { id: 'node-1', content: 'Alpha Beta', title: 'Alpha Beta' } } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    trashedNodeIds: [],
    updateNodeContent: vi.fn(),
    ...overrides
  };
}

it('runs highlight and cloze commands from the live editor selection', () => {
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-1');
  const createQANodeFromSelection = vi.fn(() => 'qa-1');
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ createHighlightNodeFromSelection, createQANodeFromSelection }))
  );

  act(() => result.current.handleCreateHighlight());
  act(() => result.current.handleCreateCloze());

  expect(createHighlightNodeFromSelection).toHaveBeenCalledWith('node-1', 'Alpha', expect.any(String), expect.objectContaining({ kind: 'highlight' }), null);
  expect(createQANodeFromSelection).toHaveBeenCalledWith('node-1', '[...] Beta', 'Alpha', expect.any(String), expect.objectContaining({ kind: 'cloze' }));
});

it('leaves editor focus after creating highlight or cloze annotations', () => {
  const editorElement = document.createElement('div');
  editorElement.contentEditable = 'true';
  document.body.append(editorElement);
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-1');
  const createQANodeFromSelection = vi.fn(() => 'qa-1');
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ createHighlightNodeFromSelection, createQANodeFromSelection }))
  );

  editorElement.focus();
  act(() => result.current.handleCreateHighlight());
  expect(document.activeElement).not.toBe(editorElement);

  editorElement.focus();
  act(() => result.current.handleCreateCloze());
  expect(document.activeElement).not.toBe(editorElement);
});

it('leaves editor focus after creating annotations from a preserved payload', () => {
  const editorElement = document.createElement('div');
  editorElement.contentEditable = 'true';
  document.body.append(editorElement);
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs()));
  const payload = {
    anchorId: 'anchor-1',
    clozeContent: '[...] Beta',
    entries: [{
      anchorId: 'anchor-1',
      clozeContent: '[...] Beta',
      locator: { from: 0, originalText: 'Alpha', to: 5 },
      range: { from: 0, to: 5 },
      selectionText: 'Alpha'
    }],
    parentNodeId: 'node-1',
    selectionText: 'Alpha'
  };

  editorElement.focus();
  act(() => result.current.handleCreateHighlightFromPayload(payload));
  expect(document.activeElement).not.toBe(editorElement);

  editorElement.focus();
  act(() => result.current.handleCreateClozeFromPayload(payload));
  expect(document.activeElement).not.toBe(editorElement);
});

it('opens the add-note panel from the live editor selection', () => {
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs()));

  act(() => result.current.handleOpenSelectionNote());

  expect(result.current.contextMenu).toMatchObject({
    initialNoteOpen: true,
    kind: 'selection',
    mode: 'annotation-toolbar',
    payload: expect.objectContaining({ selectionText: 'Alpha' })
  });
});
