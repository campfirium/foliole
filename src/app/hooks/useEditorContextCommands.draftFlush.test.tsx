import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function createEditorAdapter() {
  return {
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getSelectionRanges: vi.fn(() => [{ from: 0, to: 7 }])
  };
}

function createHookArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeNode: { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } as never,
    activeNodeId: 'node-1',
    createChildNode: vi.fn(() => 'child-note'),
    createHighlightNodeFromSelection: vi.fn(() => 'highlight-1'),
    createQANodeFromSelection: vi.fn(() => 'qa-1'),
    deleteEditorAnnotationNodes: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: createEditorAdapter() } as never,
    flushPendingEditorDraft: vi.fn(() => false),
    isTrashViewOpen: false,
    nodesById: { 'node-1': { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    trashedNodeIds: [],
    updateNodeContent: vi.fn(),
    ...overrides
  };
}

it('flushes the pending editor draft before creating a selection highlight', () => {
  const flushPendingEditorDraft = vi.fn(() => true);
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-1');
  const { result } = renderHook(() =>
    useEditorContextCommands(createHookArgs({ createHighlightNodeFromSelection, flushPendingEditorDraft }))
  );

  act(() => {
    result.current.handleCreateHighlightFromPayload({
      anchorId: 'anchor-1',
      clozeContent: '[...]',
      entries: [{
        anchorId: 'anchor-1',
        clozeContent: '[...]',
        locator: { from: 0, originalText: 'Welcome', to: 7 },
        range: { from: 0, to: 7 },
        selectionText: 'Welcome'
      }],
      parentNodeId: 'node-1',
      selectionText: 'Welcome'
    });
  });

  expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
  expect(createHighlightNodeFromSelection).toHaveBeenCalledTimes(1);
  expect(flushPendingEditorDraft.mock.invocationCallOrder[0]).toBeLessThan(
    createHighlightNodeFromSelection.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
});
