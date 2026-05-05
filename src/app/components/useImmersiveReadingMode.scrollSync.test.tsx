import { act, renderHook, waitFor } from '@testing-library/react';
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

function buildAdapter() {
  let selection: EditorSelection = { from: 0, to: 0 };
  let scrollListener: (() => void) | null = null;
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Alpha\n\nBeta'),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getPrimaryVisiblePosition: vi.fn<() => number | null>(() => null),
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
  return {
    adapter,
    triggerScroll: () => scrollListener?.()
  };
}

function buildProps() {
  const { adapter, triggerScroll } = buildAdapter();
  let readingSelection: EditorSelection | null = null;
  let applyingSelection: EditorSelection | null = null;
  return {
    adapter,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      editorNodeViewState: undefined,
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') },
      onCreateSelectionHighlight: vi.fn(),
      onCreateSelectionNote: vi.fn(),
      onExitImmersiveMode: vi.fn(),
      onRevealDocumentSelection: vi.fn((nextSelection: EditorSelection) => {
        adapter.revealSelection(nextSelection);
        readingSelection = nextSelection;
      }),
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
    } as unknown as ImmersiveProps,
    triggerScroll
  };
}

function mountViewportHost() {
  const scroller = document.createElement('div');
  scroller.className = 'cm-scroller';
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    value: () => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60 })
  });
  const host = document.createElement('div');
  host.className = 'prompt-editor-host';
  host.append(scroller);
  document.body.append(host);
}

it('keeps the current scene when entering immersive reading by applying the pending selection', async () => {
  const { adapter, props, triggerScroll } = buildProps();
  const beginApplyingReadingPosition = vi.fn();
  const initialProps: ImmersiveProps = { ...props, beginApplyingReadingPosition, isImmersiveMode: false };
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  const { rerender } = renderHook(({ nextProps }) => useImmersiveReadingMode(nextProps), {
    initialProps: { nextProps: initialProps }
  });
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
  });

  rerender({
    nextProps: {
      ...initialProps,
      isImmersiveMode: true
    }
  });

  await waitFor(() => {
    expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
  });
  expect(beginApplyingReadingPosition).toHaveBeenCalledWith({ from: 7, to: 7 }, 'enter-immersive');
  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.revealSelection).not.toHaveBeenCalled();
});

it('samples the viewport and starts applying when F11 enters immersive reading', () => {
  const { adapter, props } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  props.isImmersiveMode = false;
  const beginApplyingReadingPosition = vi.fn();
  props.beginApplyingReadingPosition = beginApplyingReadingPosition;
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
  });

  expect(props.onToggleImmersiveMode).toHaveBeenCalledTimes(1);
  expect(adapter.getPrimaryVisiblePosition).toHaveBeenCalledTimes(1);
  expect(props.getReadingPositionSelection()).toEqual({ from: 7, to: 7 });
  expect(beginApplyingReadingPosition).toHaveBeenCalledWith({ from: 7, to: 7 }, 'enter-immersive');
});

it('updates the reading position from manual scroll while immersive reading', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    triggerScroll();
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 7, to: 11 });
});

it('does not let a sampled viewport overwrite the target while an applying lock is active', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(14);
  props.setReadingPositionSelection({ from: 4296, to: 4296 });
  props.beginApplyingReadingPosition({ from: 4296, to: 4296 }, 'test-applying-lock');
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    triggerScroll();
  });

  expect(props.getReadingPositionSelection()).toEqual({ from: 4296, to: 4296 });
  expect(adapter.setSelection).not.toHaveBeenCalledWith({ from: 14, to: 14 });
});

it('ignores the immediate scroll event caused by paragraph navigation', () => {
  const { adapter, props, triggerScroll } = buildProps();
  mountViewportHost();
  vi.mocked(adapter.getPrimaryVisiblePosition).mockReturnValue(7);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 0, to: 5 });
  vi.mocked(adapter.setSelection).mockClear();

  act(() => {
    triggerScroll();
  });

  expect(adapter.setSelection).not.toHaveBeenCalled();

  act(() => {
    triggerScroll();
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
});
