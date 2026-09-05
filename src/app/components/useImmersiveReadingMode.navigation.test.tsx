import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import {
  IMMERSIVE_READING_BACKWARD_REVEAL_RATIO,
  IMMERSIVE_READING_FORWARD_REVEAL_RATIO
} from './immersiveReadingViewportBand';
import { useImmersiveReadingMode } from './useImmersiveReadingMode';

type ImmersiveProps = Parameters<typeof useImmersiveReadingMode>[0];

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

function buildAdapter(content: string) {
  let selection: EditorSelection = { from: 0, to: 0 };
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => content),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getPositionClientRect: vi.fn<() => DOMRect | null>(() => null),
    getPositionViewportTop: vi.fn<() => number | null>(() => null),
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
  return { adapter };
}

function buildProps() {
  const { adapter } = buildAdapter('Alpha\n\nBeta');
  let readingSelection: EditorSelection | null = null;
  let applyingSelection: EditorSelection | null = null;
  return {
    adapter,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') },
      onCreateSelectionHighlight: vi.fn(),
      onToggleSelectionHighlight: vi.fn(() => 'created'),
      onCreateSelectionNote: vi.fn(),
      onExitImmersiveMode: vi.fn(),
      onRevealDocumentSelection: vi.fn(),
      beginApplyingReadingPosition: (selection: EditorSelection) => {
        applyingSelection = selection;
      },
      completeApplyingReadingPosition: () => {
        applyingSelection = null;
      },
      getReadingPositionSelection: () => readingSelection,
      getReadingPositionSyncState: () =>
        applyingSelection ? { reason: 'test', startedAt: Date.now(), targetSelection: applyingSelection } : null,
      setReadingPositionSelection: (selection: EditorSelection) => {
        readingSelection = selection;
      },
      onSelectNode: vi.fn(),
      onToggleImmersiveMode: vi.fn(),
      trashedNodeIds: []
    } as ImmersiveProps
  };
}

it('moves downward reading back near the top after it leaves the lower safe band', () => {
  const { adapter, props } = buildProps();
  vi.mocked(adapter.getDocumentPositionAtViewportY)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(5);
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.revealSelectionAtViewportRatio).toHaveBeenCalledTimes(1);
  expect(adapter.revealSelectionAtViewportRatio).toHaveBeenCalledWith(
    { from: 7, to: 7 },
    IMMERSIVE_READING_FORWARD_REVEAL_RATIO,
    { preserveFocus: true }
  );
  expect(IMMERSIVE_READING_FORWARD_REVEAL_RATIO).toBe(0.15);
  expect(adapter.getDocumentPositionAtViewportY).toHaveBeenNthCalledWith(2, 200);
});

it('uses the complete paragraph bounds to cross the lower trigger', () => {
  const { adapter, props } = buildProps();
  vi.mocked(adapter.getPositionClientRect)
    .mockReturnValueOnce(new DOMRect(20, 150, 1, 20))
    .mockReturnValueOnce(new DOMRect(20, 190, 1, 20));
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.revealSelectionAtViewportRatio).toHaveBeenCalledWith(
    { from: 7, to: 7 },
    IMMERSIVE_READING_FORWARD_REVEAL_RATIO,
    { preserveFocus: true }
  );
  expect(adapter.getDocumentPositionAtViewportY).not.toHaveBeenCalled();
});

it('starts a controlled movement back to the top of the reading band', () => {
  const { adapter, props } = buildProps();
  vi.mocked(adapter.getDocumentPositionAtViewportY).mockReturnValueOnce(0).mockReturnValueOnce(5);
  vi.mocked(adapter.getPositionViewportTop).mockReturnValue(210);
  vi.mocked(adapter.getScrollMetrics).mockReturnValue({ clientHeight: 200, scrollHeight: 1000, scrollTop: 100 });
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.setScrollTop).not.toHaveBeenCalled();
  expect(adapter.revealSelectionAtViewportRatio).not.toHaveBeenCalled();
});

it('repositions upward navigation near the bottom of the safe band when needed', () => {
  const { adapter, props } = buildProps();
  (props as { editorNodeViewState?: { scrollTop: number; selection: EditorSelection } }).editorNodeViewState = {
    scrollTop: 120,
    selection: { from: 7, to: 7 }
  };
  vi.mocked(adapter.getDocumentPositionAtViewportY).mockReturnValue(3);
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  });

  expect(adapter.revealSelectionAtViewportRatio).toHaveBeenCalledWith(
    { from: 0, to: 0 },
    IMMERSIVE_READING_BACKWARD_REVEAL_RATIO,
    { preserveFocus: true }
  );
});

it('does not stall when moving backward and then forward again', () => {
  const { adapter, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(1, { from: 7, to: 11 });
  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(2, { from: 0, to: 5 });
  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(3, { from: 7, to: 11 });
});

it('opens the previous readable note when moving upward from the first paragraph', () => {
  const { props } = buildProps();
  props.activeNodeId = 'node-2';
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  });

  expect(props.onSelectNode).toHaveBeenCalledWith('node-1');
});
