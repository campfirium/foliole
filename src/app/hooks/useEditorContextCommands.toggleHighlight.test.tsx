import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function createEditorAdapter(content: string, from: number, to: number) {
  return {
    getContent: vi.fn(() => content),
    getSelectionRanges: vi.fn(() => [{ from, to }]),
    replaceRange: vi.fn(),
    setSelection: vi.fn(),
    setSelectionRanges: vi.fn()
  };
}

it('hard deletes the matched highlight when toggling the same reading selection again', () => {
  const content = '<highlight id="1">Alpha</highlight id="1">\n\nBeta';
  const deleteNodePermanently = vi.fn();
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-2');
  const adapter = createEditorAdapter(content, 0, 'Alpha'.length);

  const { result } = renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content, title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createChildNode: vi.fn(() => 'child-note'),
      createHighlightNodeFromSelection,
      createQANodeFromSelection: vi.fn(() => 'qa-1'),
      deleteNodePermanently,
      deleteImageClozeRegion: vi.fn(),
      editorRef: { current: adapter } as never,
      isTrashViewOpen: false,
      trashedNodeIds: [],
      nodesById: {
        'node-1': { id: 'node-1', content, title: 'Welcome to Foliole' },
        'highlight-1': {
          anchorLink: { id: '1', kind: 'highlight' },
          content: 'Alpha',
          id: 'highlight-1',
          parentNodeId: 'node-1',
          title: 'Alpha'
        }
      } as never,
      onExitImmersiveMode: vi.fn(),
      onSelectNode: vi.fn(),
      updateNodeContent: vi.fn()
    })
  );

  act(() => {
    result.current.handleToggleSelectionHighlightFromPayload({
      anchorId: '2',
      clozeContent: '[...]\n\nBeta',
      entries: [
        {
          anchorId: '2',
          clozeContent: '[...]\n\nBeta',
          locator: { from: 0, originalText: 'Alpha', to: 'Alpha'.length },
          range: { from: 0, to: 'Alpha'.length },
          selectionText: 'Alpha'
        }
      ],
      parentNodeId: 'node-1',
      selectionText: 'Alpha'
    });
  });

  expect(deleteNodePermanently).toHaveBeenCalledWith('highlight-1');
  expect(createHighlightNodeFromSelection).not.toHaveBeenCalled();
  expect(adapter.replaceRange).toHaveBeenCalledWith(0, content.indexOf('\n\nBeta'), 'Alpha');
  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 0, to: 5 });
});

it('hard deletes a locator-only highlight without rewriting parent content', () => {
  const content = 'Alpha\n\nBeta';
  const deleteNodePermanently = vi.fn();
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-2');
  const updateNodeContent = vi.fn();
  const adapter = createEditorAdapter(content, 0, 'Alpha'.length);

  const { result } = renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content, title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createChildNode: vi.fn(() => 'child-note'),
      createHighlightNodeFromSelection,
      createQANodeFromSelection: vi.fn(() => 'qa-1'),
      deleteNodePermanently,
      deleteImageClozeRegion: vi.fn(),
      editorRef: { current: adapter } as never,
      isTrashViewOpen: false,
      trashedNodeIds: [],
      nodesById: {
        'node-1': { id: 'node-1', content, title: 'Welcome to Foliole' },
        'highlight-1': {
          anchorLink: { id: '1', kind: 'highlight', locator: { from: 0, originalText: 'Alpha', to: 5 } },
          content: 'Alpha',
          id: 'highlight-1',
          parentNodeId: 'node-1',
          title: 'Alpha'
        }
      } as never,
      onExitImmersiveMode: vi.fn(),
      onSelectNode: vi.fn(),
      updateNodeContent
    })
  );

  act(() => {
    result.current.handleToggleSelectionHighlightFromPayload({
      anchorId: '2',
      clozeContent: '[...]\n\nBeta',
      entries: [
        {
          anchorId: '2',
          clozeContent: '[...]\n\nBeta',
          locator: { from: 0, originalText: 'Alpha', to: 'Alpha'.length },
          range: { from: 0, to: 'Alpha'.length },
          selectionText: 'Alpha'
        }
      ],
      parentNodeId: 'node-1',
      selectionText: 'Alpha'
    });
  });

  expect(deleteNodePermanently).toHaveBeenCalledWith('highlight-1');
  expect(createHighlightNodeFromSelection).not.toHaveBeenCalled();
  expect(adapter.replaceRange).not.toHaveBeenCalled();
  expect(updateNodeContent).not.toHaveBeenCalled();
});
