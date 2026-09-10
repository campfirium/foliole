import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../../shared/platform/attachmentImageActions';
import {
  createTestAttachmentResource,
  registerTestAttachmentResource,
  resetTestAttachmentResources
} from '../../test/attachmentResourceTestSupport';

import { useEditorContextCommands } from './useEditorContextCommands';

vi.mock('../../shared/platform/attachmentImageActions', () => ({
  copyAttachmentImageToClipboard: vi.fn(),
  exportAttachmentImage: vi.fn()
}));

const IMAGE_ATTACHMENT_ID = 'hash-1';
const { assetUrl: IMAGE_ASSET_URL } = createTestAttachmentResource({ attachmentId: IMAGE_ATTACHMENT_ID });
const IMAGE_MARKDOWN = `![Cover](${IMAGE_ASSET_URL})`;

function createImageTarget(from = '3', to = String(IMAGE_MARKDOWN.length - 1)) {
  const imageTarget = document.createElement('img');
  const imageWidget = document.createElement('span');
  imageWidget.dataset.mdImageAttachmentId = IMAGE_ATTACHMENT_ID;
  imageWidget.dataset.mdImageFrom = from;
  imageWidget.dataset.mdImageSource = IMAGE_ASSET_URL;
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
    deleteEditorAnnotationNodes: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: createEditorAdapter() },
    flushPendingEditorDraft: vi.fn(() => false),
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
  registerTestAttachmentResource({ attachmentId: IMAGE_ATTACHMENT_ID });
  vi.clearAllMocks();
});

afterEach(() => {
  resetTestAttachmentResources();
});

it('opens image commands with a highlightable payload when the target is an attachment image', () => {
  const editorRef = {
    current: createEditorAdapter({
      getContent: vi.fn(() => IMAGE_MARKDOWN)
    })
  };
  const imageTarget = createImageTarget();

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: `abc${IMAGE_MARKDOWN}`, title: 'Welcome to Foliole' } as never,
        editorRef,
        nodesById: { 'node-1': { id: 'node-1', content: `abc${IMAGE_MARKDOWN}`, title: 'Welcome to Foliole' } } as never
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
    imageAttachmentId: IMAGE_ATTACHMENT_ID,
    imageRange: { from: 3, to: IMAGE_MARKDOWN.length - 1 },
    kind: 'image',
    left: 40,
    top: 48
  });
  expect(result.current.contextMenu?.payload).toMatchObject({
    imageRegions: [
      {
        attachmentId: IMAGE_ATTACHMENT_ID,
        regions: [expect.objectContaining({ height: 1, width: 1, x: 0, y: 0 })]
      }
    ],
    selectionText: IMAGE_MARKDOWN.slice(3, -1)
  });
});

it('creates a highlight from an image context menu target', () => {
  const createHighlightNodeFromSelection = vi.fn(() => 'highlight-1');
  const editorRef = {
    current: createEditorAdapter({
      getContent: vi.fn(() => IMAGE_MARKDOWN),
      getSelectionRanges: vi.fn(() => [])
    })
  };
  const imageTarget = createImageTarget('0', String(IMAGE_MARKDOWN.length));

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: IMAGE_MARKDOWN, title: 'Welcome to Foliole' } as never,
        createHighlightNodeFromSelection,
        editorRef,
        nodesById: { 'node-1': { id: 'node-1', content: IMAGE_MARKDOWN, title: 'Welcome to Foliole' } } as never
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
    IMAGE_MARKDOWN,
    expect.any(String),
    expect.objectContaining({
      kind: 'highlight',
      locator: { from: 0, originalText: IMAGE_MARKDOWN, to: IMAGE_MARKDOWN.length }
    }),
    [
      {
        attachmentId: IMAGE_ATTACHMENT_ID,
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
        activeNode: { id: 'node-1', content: IMAGE_MARKDOWN, title: 'Welcome to Foliole' } as never,
        editorRef: { current: adapter },
        nodesById: { 'node-1': { id: 'node-1', content: IMAGE_MARKDOWN, title: 'Welcome to Foliole' } } as never,
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

  expect(copyAttachmentImageToClipboard).toHaveBeenCalledWith(IMAGE_ATTACHMENT_ID);
  expect(adapter.replaceRange).toHaveBeenCalledWith(3, IMAGE_MARKDOWN.length - 1, '');
  expect(updateNodeContent).toHaveBeenCalledWith('node-1', 'after-cut');
});

it('exports an attachment image through the native bridge', async () => {
  vi.mocked(exportAttachmentImage).mockResolvedValue({ path: '/tmp/cover.png', status: 'saved' });
  const imageTarget = createImageTarget();

  const { result } = renderHook(() =>
    useEditorContextCommands(
      buildHookArgs({
        activeNode: { id: 'node-1', content: IMAGE_MARKDOWN, title: 'Welcome to Foliole' } as never,
        editorRef: { current: null },
        nodesById: { 'node-1': { id: 'node-1', content: IMAGE_MARKDOWN, title: 'Welcome to Foliole' } } as never
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

  expect(exportAttachmentImage).toHaveBeenCalledWith(IMAGE_ATTACHMENT_ID);
});
