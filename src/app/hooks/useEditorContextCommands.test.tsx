import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();

beforeEach(() => {
  requestAnimationFrameSpy.mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
});

function createEditorAdapter(overrides: Record<string, unknown> = {}) {
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
    setSelectionRanges: vi.fn(),
    ...overrides
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
    trashedNodeIds: [],
    nodesById: { 'node-1': { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    updateNodeContent: vi.fn(),
    ...overrides
  };
}

it('reapplies the current selection when opening the editor context menu', () => {
  const adapter = createEditorAdapter({
    getSelection: vi.fn(() => ({ from: 2, to: 9 })),
    getSelectionRanges: vi.fn(() => [{ from: 2, to: 9 }])
  });

  const editorRef = { current: adapter };
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ editorRef }))
  );

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn()
    } as never);
  });

  expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  expect(adapter.setSelectionRanges).toHaveBeenCalledWith([{ from: 2, to: 9 }]);
  expect(adapter.focus).toHaveBeenCalledTimes(1);
});

it('keeps the last valid markdown selection payload when right-click clears the live selection', () => {
  const adapter = createEditorAdapter({
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getSelection: vi.fn(() => ({ from: 0, to: 0 })),
    getSelectionRanges: vi.fn(() => [])
  });

  const editorRef = { current: adapter };
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ editorRef }))
  );

  act(() => {
    editorRef.current = createEditorAdapter({
      getContent: vi.fn(() => 'Welcome to Foliole'),
      getSelection: vi.fn(() => ({ from: 0, to: 7 })),
      getSelectionRanges: vi.fn(() => [{ from: 0, to: 7 }])
    }) as never;
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    editorRef.current = adapter as never;
  });

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn()
    } as never);
  });

  expect(result.current.contextMenu).toMatchObject({
    canRunCommands: true,
    kind: 'selection',
    payload: expect.objectContaining({
      parentNodeId: 'node-1',
      selectionText: 'Welcome'
    })
  });
});

it('creates a linked note from an explicit reading selection payload', () => {
  let content = 'Alpha\n\nBeta';
  const updateNodeContent = vi.fn();
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-1');
  const createChildNode = vi.fn(() => 'note-1');
  const onSelectNode = vi.fn();
  const onExitImmersiveMode = vi.fn();
  const adapter = createEditorAdapter({
    getContent: vi.fn(() => content),
    replaceRange: vi.fn((from: number, to: number, next: string) => {
      content = `${content.slice(0, from)}${next}${content.slice(to)}`;
    })
  });

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content, title: 'Welcome to Foliole' } as never,
        createChildNode,
        createHighlightNodeFromSelection,
        editorRef: { current: adapter },
        nodesById: { 'node-1': { id: 'node-1', content, title: 'Welcome to Foliole' } } as never,
        onExitImmersiveMode,
        onSelectNode,
        updateNodeContent
      })
    )
  );

  act(() => {
    result.current.handleCreateNoteFromPayload({
      anchorId: '1',
      clozeContent: '[...]\n\nBeta',
      entries: [{
        anchorId: '1',
        clozeContent: '[...]\n\nBeta',
        locator: { from: 0, originalText: 'Alpha', to: 5 },
        range: { from: 0, to: 5 },
        selectionText: 'Alpha'
      }],
      parentNodeId: 'node-1',
      selectionText: 'Alpha'
    });
  });

  expect(createHighlightNodeFromSelection).toHaveBeenCalledWith('node-1', 'Alpha', '1', {
    id: '1',
    kind: 'highlight',
    locator: { from: 0, originalText: 'Alpha', to: 5 }
  }, undefined);
  expect(createChildNode).toHaveBeenCalledWith('highlight-1', '');
  expect(onExitImmersiveMode).toHaveBeenCalledTimes(1);
  expect(onSelectNode).toHaveBeenCalledWith('note-1');
  expect(updateNodeContent).not.toHaveBeenCalled();
});

it('keeps multi-range cloze locators when creating a cloze from selection payload', () => {
  const createQANodeFromSelection = vi.fn(() => 'qa-1');

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        createQANodeFromSelection
      })
    )
  );

  act(() => {
    result.current.handleCreateClozeFromPayload({
      anchorId: 'multi-1',
      clozeContent: '[...] Beta [...] Delta',
      entries: [
        {
          anchorId: 'multi-1',
          clozeContent: '[...] Beta [...] Delta',
          locator: { from: 0, originalText: 'Alpha', to: 5 },
          range: { from: 0, to: 5 },
          selectionText: 'Alpha'
        },
        {
          anchorId: 'multi-2',
          clozeContent: '[...] Beta [...] Delta',
          locator: { from: 11, originalText: 'Gamma', to: 16 },
          range: { from: 11, to: 16 },
          selectionText: 'Gamma'
        }
      ],
      parentNodeId: 'node-1',
      selectionText: 'Alpha\nGamma'
    });
  });

  expect(createQANodeFromSelection).toHaveBeenCalledWith('node-1', '[...] Beta [...] Delta', 'Alpha\nGamma', 'multi-1', {
    id: 'multi-1',
    kind: 'cloze',
    locator: {
      ranges: [
        { from: 0, originalText: 'Alpha', to: 5 },
        { from: 11, originalText: 'Gamma', to: 16 }
      ]
    }
  });
});
