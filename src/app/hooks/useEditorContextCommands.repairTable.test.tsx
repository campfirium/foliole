import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

function createEditorAdapter(contentRef: { value: string }, overrides: Record<string, unknown> = {}) {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => contentRef.value),
    getDocumentPositionAtClientPoint: vi.fn(() => 0),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 0, to: 0 })),
    getSelectionRanges: vi.fn(() => []),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn((from: number, to: number, next: string) => {
      contentRef.value = `${contentRef.value.slice(0, from)}${next}${contentRef.value.slice(to)}`;
    }),
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

function buildHookArgs(contentRef: { value: string }, overrides: Record<string, unknown> = {}) {
  return {
    activeNode: { id: 'node-1', content: contentRef.value, title: 'Topic' } as never,
    activeNodeId: 'node-1',
    createChildNode: vi.fn(() => 'child-note'),
    createHighlightNodeFromSelection: vi.fn(() => 'highlight-1'),
    createQANodeFromSelection: vi.fn(() => 'qa-1'),
    deleteNodePermanently: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: createEditorAdapter(contentRef) },
    isTrashViewOpen: false,
    trashedNodeIds: [],
    nodesById: { 'node-1': { id: 'node-1', content: contentRef.value, title: 'Topic' } } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    updateNodeContent: vi.fn(),
    ...overrides
  };
}

it('repairs a delimiter table from the editor context menu', () => {
  const contentRef = { value: '| A | B |\n\n| --- | --- |\n\n| 1 | 2 |' };
  const updateNodeContent = vi.fn();
  const adapter = createEditorAdapter(contentRef, {
    getDocumentPositionAtClientPoint: vi.fn(() => contentRef.value.indexOf('---'))
  });

  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs(contentRef, { editorRef: { current: adapter }, updateNodeContent }))
  );

  act(() => result.current.handleEditorContextMenu({ clientX: 40, clientY: 48, preventDefault: vi.fn() } as never));

  expect(result.current.contextMenu).toMatchObject({ kind: 'selection', repairTableAvailable: true });

  act(() => {
    result.current.handleRepairTable();
  });

  expect(contentRef.value).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  expect(updateNodeContent).toHaveBeenCalledWith('node-1', contentRef.value);
  expect(result.current.contextMenu).toBeNull();
});

it('offers table repair for selected pipe rows without a delimiter row', () => {
  const contentRef = { value: '| A | B |\n\n| 1 | 2 |' };
  const adapter = createEditorAdapter(contentRef, {
    getDocumentPositionAtClientPoint: vi.fn(() => contentRef.value.indexOf('A')),
    getSelection: vi.fn(() => ({ from: 0, to: contentRef.value.length })),
    getSelectionRanges: vi.fn(() => [{ from: 0, to: contentRef.value.length }])
  });

  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs(contentRef, { editorRef: { current: adapter } }))
  );

  act(() => result.current.handleEditorContextMenu({ clientX: 40, clientY: 48, preventDefault: vi.fn() } as never));

  expect(result.current.contextMenu).toMatchObject({ kind: 'selection', repairTableAvailable: true });
});
