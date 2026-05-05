import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../../shared/platform/attachmentImageActions';

import { useEditorContextCommands } from './useEditorContextCommands';

vi.mock('../../shared/platform/attachmentImageActions', () => ({
  copyAttachmentImageToClipboard: vi.fn(),
  exportAttachmentImage: vi.fn()
}));

function createImageTarget(from = '3', to = '27') {
  const imageTarget = document.createElement('img');
  const imageWidget = document.createElement('span');
  imageWidget.dataset.mdImageAttachmentId = 'hash-1';
  imageWidget.dataset.mdImageFrom = from;
  imageWidget.dataset.mdImageSource = 'asset://hash-1.png';
  imageWidget.dataset.mdImageTo = to;
  imageWidget.append(imageTarget);
  return imageTarget;
}

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

beforeEach(() => {
  vi.clearAllMocks();
});

it('opens image commands with a highlightable payload when the target is an attachment image', () => {
  const editorRef = {
    current: createEditorAdapter({
      getContent: vi.fn(() => '![Cover](asset://hash-1.png)')
    })
  };
  const imageTarget = createImageTarget();

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: 'abc![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
        editorRef,
        nodesById: { 'node-1': { id: 'node-1', content: 'abc![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } } as never
      })
    )
  );

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn(),
      target: imageTarget
    } as never);
  });

  expect(result.current.contextMenu).toMatchObject({
    canRunCommands: true,
    imageAttachmentId: 'hash-1',
    imageRange: { from: 3, to: 27 },
    kind: 'image',
    left: 40,
    top: 48
  });
  expect(result.current.contextMenu?.payload).toMatchObject({
    imageRegions: [
      {
        attachmentId: 'hash-1',
        regions: [expect.objectContaining({ height: 1, width: 1, x: 0, y: 0 })]
      }
    ],
    selectionText: 'over](asset://hash-1.png'
  });
});

it('creates a highlight from an image context menu target', () => {
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-1');
  const editorRef = {
    current: createEditorAdapter({
      getContent: vi.fn(() => '![Cover](asset://hash-1.png)'),
      getSelectionRanges: vi.fn(() => [])
    })
  };
  const imageTarget = createImageTarget('0', '28');

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
        createHighlightNodeFromSelection,
        editorRef,
        nodesById: { 'node-1': { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } } as never
      })
    )
  );

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn(),
      target: imageTarget
    } as never);
  });

  act(() => {
    result.current.handleCreateHighlight();
  });

  expect(createHighlightNodeFromSelection).toHaveBeenCalledWith(
    'node-1',
    '![Cover](asset://hash-1.png)',
    expect.any(String),
    expect.objectContaining({
      kind: 'highlight',
      locator: { from: 0, originalText: '![Cover](asset://hash-1.png)', to: 28 }
    }),
    [
      {
        attachmentId: 'hash-1',
        regions: [expect.objectContaining({ height: 1, width: 1, x: 0, y: 0 })]
      }
    ]
  );
});

it('cuts an attachment image only after clipboard copy succeeds', async () => {
  vi.mocked(copyAttachmentImageToClipboard).mockResolvedValue({ status: 'copied' });
  const updateNodeContent = vi.fn();
  const adapter = createEditorAdapter({
    getContent: vi.fn(() => 'after-cut')
  });
  const imageTarget = createImageTarget();

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
        editorRef: { current: adapter },
        nodesById: { 'node-1': { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } } as never,
        updateNodeContent
      })
    )
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
  const imageTarget = createImageTarget();

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
        editorRef: { current: null },
        nodesById: { 'node-1': { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } } as never
      })
    )
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
