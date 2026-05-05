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

it('reapplies the current selection when opening the editor context menu', () => {
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 2, to: 9 })),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceSelection: vi.fn(),
    revealSelection: vi.fn(),
    setContent: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn()
  };

  const editorRef = { current: adapter };
  const { result } = renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createHighlightNodeFromSelection: vi.fn(),
      createQANodeFromSelection: vi.fn(),
      editorRef,
      isTrashViewOpen: false,
      updateNodeContent: vi.fn()
    })
  );

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn()
    } as never);
  });

  expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 2, to: 9 });
  expect(adapter.focus).toHaveBeenCalledTimes(1);
});
