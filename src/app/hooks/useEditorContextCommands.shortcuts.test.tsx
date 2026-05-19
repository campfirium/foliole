import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

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
    deleteNodePermanently: vi.fn(),
    editorRef: { current: createEditorAdapter() },
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
