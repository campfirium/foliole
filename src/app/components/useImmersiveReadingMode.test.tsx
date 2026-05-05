import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

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
  let scrollListener: (() => void) | null = null;
  const revealSelection = vi.fn((nextSelection: EditorSelection) => {
    selection = nextSelection;
  });
  const setSelection = vi.fn((nextSelection: EditorSelection) => {
    selection = nextSelection;
  });
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => content),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getPrimaryVisiblePosition: vi.fn(() => 0),
    getViewportRect: vi.fn(() => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60 })),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 100, scrollHeight: 100, scrollTop: 0 })),
    getScrollTop: vi.fn(() => 0),
    getSelection: vi.fn(() => selection),
    getSelectionRanges: vi.fn(() => [selection]),
    onContentChange: vi.fn(),
    onScroll: vi.fn((listener: () => void) => {
      scrollListener = listener;
      return () => {
        if (scrollListener === listener) {
          scrollListener = null;
        }
      };
    }),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    revealSelectionAtViewportRatio: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection,
    isPositionNearViewportRatio: vi.fn(() => true),
    setParagraphMarker: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setReadOnly: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection,
    setSelectionRanges: vi.fn()
  };
  return {
    adapter,
    getSelection: () => selection,
    triggerScroll: () => scrollListener?.()
  };
}

function buildProps() {
  const content = 'Alpha\n\nBeta';
  const { adapter, triggerScroll } = buildAdapter(content);
  let readingSelection: EditorSelection | null = null;
  let applyingSelection: EditorSelection | null = null;
  const onCreateSelectionHighlight = vi.fn(() => 'highlight-1');
  const onCreateSelectionNote = vi.fn(() => 'note-1');
  const onRevealDocumentSelection = vi.fn((nextSelection: EditorSelection) => {
    adapter.revealSelection(nextSelection);
    readingSelection = nextSelection;
  });
  const onSelectNode = vi.fn();

  return {
    adapter,
    onCreateSelectionHighlight,
    onCreateSelectionNote,
    onRevealDocumentSelection,
    onSelectNode,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      editorNodeViewState: undefined,
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') },
      onCreateSelectionHighlight,
      onCreateSelectionNote,
      onExitImmersiveMode: vi.fn(),
      onRevealDocumentSelection,
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
      onSelectNode,
      onToggleImmersiveMode: vi.fn(),
      trashedNodeIds: []
    } as unknown as ImmersiveProps,
    triggerScroll
  };
}
it('moves paragraph selection with space and opens the next readable note at the end', () => {
  const { onSelectNode, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
  });

  expect(onSelectNode).toHaveBeenCalledWith('node-2');
});
it('runs highlight and note actions from the current paragraph selection', () => {
  const { onCreateSelectionHighlight, onCreateSelectionNote, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
  });

  expect(onCreateSelectionHighlight).toHaveBeenCalledWith(
    expect.objectContaining({
      parentNodeId: 'node-1',
      selectionText: 'Alpha'
    })
  );
  expect(onCreateSelectionNote).toHaveBeenCalledWith(
    expect.objectContaining({
      parentNodeId: 'node-1',
      selectionText: 'Alpha'
    })
  );
});
it('shows a paragraph marker when moving with space', () => {
  const { adapter, onRevealDocumentSelection, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
  });

  expect(onRevealDocumentSelection).not.toHaveBeenCalled();
  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 0, to: 5 });
  expect(adapter.revealSelection).toHaveBeenCalledWith({ from: 0, to: 5 });
});
it('moves the paragraph marker with arrow keys', () => {
  const { adapter, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  });

  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(1, { from: 0, to: 5 });
  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(2, { from: 7, to: 11 });
  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(3, { from: 0, to: 5 });
});
it('starts the paragraph marker from the persisted reading position', () => {
  const { adapter, props } = buildProps();
  (props as { editorNodeViewState?: { scrollTop: number; selection: EditorSelection } }).editorNodeViewState = {
    scrollTop: 120,
    selection: { from: 7, to: 7 }
  };
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.revealSelection).toHaveBeenCalledWith({ from: 7, to: 11 });
});
it('toggles the shortcuts overlay with question mark', () => {
  const { props } = buildProps();
  const { result } = renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }));
  });

  expect(result.current.isShortcutsOverlayOpen).toBe(true);
});

it('captures the viewport reading position and starts an applying lock when entering immersive mode', () => {
  const { adapter, props } = buildProps();
  props.isImmersiveMode = false;
  const beginApplyingReadingPosition = vi.fn();
  props.beginApplyingReadingPosition = beginApplyingReadingPosition;
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
  });

  expect(props.onToggleImmersiveMode).toHaveBeenCalledTimes(1);
  expect(props.getReadingPositionSelection()).toEqual({ from: 7, to: 7 });
  expect(beginApplyingReadingPosition).toHaveBeenCalledWith({ from: 7, to: 7 }, 'enter-immersive');
  expect(adapter.revealSelection).not.toHaveBeenCalled();
});
