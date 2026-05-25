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
    getViewportRect: vi.fn(() => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60, toJSON: () => ({}) })),
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
  const onToggleSelectionHighlight = vi.fn(() => 'created' as const);
  const onCreateSelectionNote = vi.fn(() => 'note-1');
  const onRevealDocumentSelection = vi.fn((nextSelection: EditorSelection) => {
    adapter.revealSelection(nextSelection);
    readingSelection = nextSelection;
  });
  const onSelectNode = vi.fn();

  return {
    adapter,
    onCreateSelectionHighlight,
    onToggleSelectionHighlight,
    onCreateSelectionNote,
    onRevealDocumentSelection,
    onSelectNode,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') },
      onCreateSelectionHighlight,
      onToggleSelectionHighlight,
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
    } as ImmersiveProps,
    triggerScroll
  };
}

it('moves paragraph selection with ArrowDown and opens the next readable note at the end', () => {
  const { onSelectNode, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(onSelectNode).toHaveBeenCalledWith('node-2');
});
it('runs highlight toggle and note actions from the current paragraph selection', () => {
  const { adapter, onToggleSelectionHighlight, onCreateSelectionNote, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
  });

  expect(onToggleSelectionHighlight).toHaveBeenCalledWith(
    expect.objectContaining({
      parentNodeId: 'node-1',
      selectionText: 'Beta'
    })
  );
  expect(onCreateSelectionNote).toHaveBeenCalledWith(
    expect.objectContaining({
      parentNodeId: 'node-1',
      selectionText: 'Beta'
    })
  );
  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.setSelectionRanges).toHaveBeenCalledWith([{ from: 7, to: 11 }]);
});

it('selects the current paragraph before toggling highlight from a collapsed reading position', () => {
  const { adapter, onToggleSelectionHighlight, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    vi.mocked(adapter.setSelection).mockClear();
    vi.mocked(adapter.setSelectionRanges).mockClear();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.setSelectionRanges).toHaveBeenCalledWith([{ from: 7, to: 11 }]);
  expect(onToggleSelectionHighlight).toHaveBeenCalledWith(
    expect.objectContaining({
      selectionText: 'Beta'
    })
  );
});
it('shows a paragraph marker when moving with ArrowDown', () => {
  const { adapter, onRevealDocumentSelection, props } = buildProps();
  vi.mocked(adapter.getDocumentPositionAtViewportY)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(7);
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  });

  expect(onRevealDocumentSelection).not.toHaveBeenCalled();
  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
  expect(adapter.setSelection).not.toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 7, to: 11 });
  expect(adapter.revealSelection).not.toHaveBeenCalled();
  expect(adapter.revealSelectionAtViewportRatio).not.toHaveBeenCalled();
});

it('moves the paragraph marker with arrow keys', () => {
  const { adapter, props } = buildProps();
  renderHook(() => useImmersiveReadingMode(props));
  vi.mocked(adapter.setParagraphMarker).mockClear();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  });

  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(1, { from: 7, to: 11 });
  expect(adapter.setParagraphMarker).toHaveBeenNthCalledWith(2, { from: 0, to: 5 });
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
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  });

  expect(adapter.setParagraphMarker).toHaveBeenCalledWith({ from: 0, to: 5 });
  expect(adapter.revealSelection).not.toHaveBeenCalled();
});
