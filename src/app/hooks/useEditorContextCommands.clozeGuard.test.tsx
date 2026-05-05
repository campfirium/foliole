import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function createEditorAdapter() {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 0, to: 0 })),
    getSelectionRanges: vi.fn(() => []),
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
    activeNode: { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } as never,
    activeNodeId: 'node-1',
    createChildNode: vi.fn(() => 'child-note'),
    createHighlightNodeFromSelection: vi.fn(() => 'highlight-1'),
    createQANodeFromSelection: vi.fn(() => 'qa-1'),
    deleteNodePermanently: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: createEditorAdapter() },
    isTrashViewOpen: false,
    nodesById: { 'node-1': { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    trashedNodeIds: [],
    updateNodeContent: vi.fn(),
    ...overrides
  };
}

function createLongClozePayload() {
  return {
    anchorId: 'long-1',
    clozeContent: 'A'.repeat(501),
    entries: [{
      anchorId: 'long-1',
      clozeContent: 'A'.repeat(501),
      locator: { from: 0, originalText: 'Selected text that should be a highlight', to: 39 },
      range: { from: 0, to: 39 },
      selectionText: 'Selected text that should be a highlight'
    }],
    parentNodeId: 'node-1',
    selectionText: 'Selected text that should be a highlight'
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

it('asks the app panel to confirm a long cloze before creating it', () => {
  const createQANodeFromSelection = vi.fn(() => 'qa-1');
  const onRemind = vi.fn();
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ createQANodeFromSelection }))
  );

  act(() => {
    result.current.handleCreateClozeFromPayload(createLongClozePayload(), { onRemind });
  });

  expect(onRemind).toHaveBeenCalledTimes(1);
  expect(createQANodeFromSelection).not.toHaveBeenCalled();
});
