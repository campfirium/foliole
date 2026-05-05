import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../../shared/platform/attachmentImageActions';

import { useEditorContextCommands } from './useEditorContextCommands';

const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();

vi.mock('../../shared/platform/attachmentImageActions', () => ({
  copyAttachmentImageToClipboard: vi.fn(),
  exportAttachmentImage: vi.fn()
}));

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
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 2, to: 9 })),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
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

it('opens image commands when the context menu targets an attachment image', () => {
  const imageTarget = document.createElement('img');
  const imageWidget = document.createElement('span');
  imageWidget.dataset.mdImageAttachmentId = 'hash-1';
  imageWidget.dataset.mdImageFrom = '3';
  imageWidget.dataset.mdImageSource = 'asset://hash-1.png';
  imageWidget.dataset.mdImageTo = '27';
  imageWidget.append(imageTarget);

  const editorRef = {
    current: {
      destroy: vi.fn(),
      focus: vi.fn(),
      getContent: vi.fn(() => '![Cover](asset://hash-1.png)'),
      getDocumentPositionAtViewportY: vi.fn(() => 0),
      getLineBlockHeight: vi.fn(() => 24),
      getScrollMetrics: vi.fn(),
      getScrollTop: vi.fn(),
      getSelection: vi.fn(() => ({ from: 0, to: 0 })),
      onContentChange: vi.fn(),
      onScroll: vi.fn(),
      replaceRange: vi.fn(),
      replaceSelection: vi.fn(),
      revealPosition: vi.fn(),
      restoreSelection: vi.fn(),
      revealSelection: vi.fn(),
      setContent: vi.fn(),
      setDiffDecorations: vi.fn(),
      setScrollTop: vi.fn(),
      setSelection: vi.fn()
    }
  };

  const { result } = renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
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
      preventDefault: vi.fn(),
      target: imageTarget
    } as never);
  });

  expect(result.current.contextMenu).toEqual({
    imageAttachmentId: 'hash-1',
    imageRange: { from: 3, to: 27 },
    kind: 'image',
    left: 40,
    top: 48
  });
});

it('cuts an attachment image only after clipboard copy succeeds', async () => {
  vi.mocked(copyAttachmentImageToClipboard).mockResolvedValue({ status: 'copied' });
  const updateNodeContent = vi.fn();
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'after-cut'),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 0, to: 0 })),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn()
  };

  const imageTarget = document.createElement('img');
  const imageWidget = document.createElement('span');
  imageWidget.dataset.mdImageAttachmentId = 'hash-1';
  imageWidget.dataset.mdImageFrom = '3';
  imageWidget.dataset.mdImageSource = 'asset://hash-1.png';
  imageWidget.dataset.mdImageTo = '27';
  imageWidget.append(imageTarget);

  const { result } = renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createHighlightNodeFromSelection: vi.fn(),
      createQANodeFromSelection: vi.fn(),
      editorRef: { current: adapter },
      isTrashViewOpen: false,
      updateNodeContent
    })
  );

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn(),
      target: imageTarget
    } as never);
  });

  await act(async () => {
    await result.current.handleCutImage();
  });

  expect(copyAttachmentImageToClipboard).toHaveBeenCalledWith('hash-1');
  expect(adapter.replaceRange).toHaveBeenCalledWith(3, 27, '');
  expect(updateNodeContent).toHaveBeenCalledWith('node-1', 'after-cut');
});

it('exports an attachment image through the native bridge', async () => {
  vi.mocked(exportAttachmentImage).mockResolvedValue({ path: '/tmp/cover.png', status: 'saved' });
  const imageTarget = document.createElement('img');
  const imageWidget = document.createElement('span');
  imageWidget.dataset.mdImageAttachmentId = 'hash-1';
  imageWidget.dataset.mdImageFrom = '3';
  imageWidget.dataset.mdImageSource = 'asset://hash-1.png';
  imageWidget.dataset.mdImageTo = '27';
  imageWidget.append(imageTarget);

  const { result } = renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createHighlightNodeFromSelection: vi.fn(),
      createQANodeFromSelection: vi.fn(),
      editorRef: { current: null },
      isTrashViewOpen: false,
      updateNodeContent: vi.fn()
    })
  );

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn(),
      target: imageTarget
    } as never);
  });

  await act(async () => {
    await result.current.handleExportImage();
  });

  expect(exportAttachmentImage).toHaveBeenCalledWith('hash-1');
});
