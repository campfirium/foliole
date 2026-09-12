import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import {
  createTestAttachmentResource,
  registerTestAttachmentResource,
  resetTestAttachmentResources
} from '../../test/attachmentResourceTestSupport';

import { useImmersiveReadingMode } from './useImmersiveReadingMode';

type ImmersiveProps = Parameters<typeof useImmersiveReadingMode>[0];

const IMAGE_ATTACHMENT_ID = 'hash-1';
const {
  assetUrl: IMAGE_ASSET_URL,
  description: { contentHash: IMAGE_CONTENT_HASH }
} = createTestAttachmentResource({ attachmentId: IMAGE_ATTACHMENT_ID });
const IMAGE_MARKDOWN = `![Cover](${IMAGE_ASSET_URL})`;
const IMAGE_FROM = 7;
const IMAGE_TO = IMAGE_FROM + IMAGE_MARKDOWN.length;

beforeEach(() => {
  registerTestAttachmentResource({ attachmentId: IMAGE_ATTACHMENT_ID });
});

afterEach(() => {
  resetTestAttachmentResources();
});

function createNode(id: string) {
  return {
    anchorLink: null,
    content: '',
    createdAt: '',
    id,
    kind: 'topic' as const,
    parentNodeId: null,
    reveal: '',
    review: null,
    title: id,
    updatedAt: ''
  };
}

function buildImageAdapter() {
  let selection: EditorSelection = { from: 0, to: 0 };
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => `Alpha\n\n${IMAGE_MARKDOWN}\n\nGamma`),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getPrimaryVisiblePosition: vi.fn(() => 0),
    getViewportRect: vi.fn(() => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60, toJSON: () => ({}) })),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 100, scrollHeight: 100, scrollTop: 0 })),
    getScrollTop: vi.fn(() => 0),
    getSelection: vi.fn(() => selection),
    getSelectionRanges: vi.fn(() => [selection]),
    onContentChange: vi.fn(),
    onScroll: vi.fn(() => () => {}),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    revealSelectionAtViewportRatio: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection: vi.fn((nextSelection: EditorSelection) => {
      selection = nextSelection;
    }),
    isPositionNearViewportRatio: vi.fn(() => true),
    setParagraphMarker: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setReadOnly: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn((nextSelection: EditorSelection) => {
      selection = nextSelection;
    }),
    setSelectionRanges: vi.fn()
  };
}

function buildImageProps() {
  const adapter = buildImageAdapter();
  return {
    adapter,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1'],
      nodesById: { 'node-1': createNode('node-1') },
      onCreateSelectionHighlight: vi.fn(),
      onToggleSelectionHighlight: vi.fn(() => 'created' as const),
      onCreateSelectionNote: vi.fn(),
      onExitImmersiveMode: vi.fn(),
      onRevealDocumentSelection: vi.fn((nextSelection: EditorSelection) => {
        adapter.revealSelection(nextSelection);
      }),
      beginApplyingReadingPosition: vi.fn(),
      completeApplyingReadingPosition: vi.fn(),
      getReadingPositionSelection: () => null,
      getReadingPositionSyncState: () => null,
      setReadingPositionSelection: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleImmersiveMode: vi.fn(),
      trashedNodeIds: []
    } as ImmersiveProps
  };
}

it('stops on a standalone image block before moving to the following text', () => {
  const { adapter, props } = buildImageProps();
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(1, { from: IMAGE_FROM, to: IMAGE_TO });
  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(2, { from: IMAGE_TO + 2, to: IMAGE_TO + 7 });
});

it('toggles highlight for a standalone image block from the reading position', () => {
  const { adapter, props } = buildImageProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: IMAGE_FROM, to: IMAGE_TO });
  expect(adapter.setSelectionRanges).toHaveBeenCalledWith([{ from: IMAGE_FROM, to: IMAGE_TO }]);
  expect(props.onToggleSelectionHighlight).toHaveBeenCalledWith(
    expect.objectContaining({
      imageRegions: [
        {
          attachmentId: IMAGE_CONTENT_HASH,
          regions: [expect.objectContaining({ height: 1, width: 1, x: 0, y: 0 })]
        }
      ],
      parentNodeId: 'node-1',
      selectionText: IMAGE_MARKDOWN
    })
  );
});
