import { act, fireEvent, renderHook } from '@testing-library/react';
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
  return {
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

function buildProps() {
  const adapter = buildAdapter('Alpha\n\nBeta');
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
      onToggleSelectionHighlight: vi.fn(() => 'created' as const),
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

it('toggles the shortcuts overlay with question mark', () => {
  const { props } = buildProps();
  const { result } = renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }));
  });

  expect(result.current.isShortcutsOverlayOpen).toBe(true);
});

it('exits immersive editing when Escape comes from the editor element', () => {
  const { props } = buildProps();
  const { result } = renderHook(() => useImmersiveReadingMode(props));
  const textarea = document.createElement('textarea');
  document.body.append(textarea);

  act(() => {
    result.current.enterImmersiveEdit();
  });

  expect(result.current.isImmersiveEditing).toBe(true);

  act(() => {
    fireEvent.keyDown(textarea, { key: 'Escape' });
  });

  expect(result.current.isImmersiveEditing).toBe(false);
  expect(props.onExitImmersiveMode).not.toHaveBeenCalled();

  textarea.remove();
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

it('allows F11 to enter immersive reading while review mode is active', () => {
  const { props } = buildProps();
  props.isImmersiveMode = false;
  props.isStudyMode = true;
  renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
  });

  expect(props.onToggleImmersiveMode).toHaveBeenCalledTimes(1);
  expect(props.onExitImmersiveMode).not.toHaveBeenCalled();
});

it('keeps immersive reading open after entering review mode', () => {
  const { props } = buildProps();
  props.isImmersiveMode = true;
  props.isStudyMode = true;
  renderHook(() => useImmersiveReadingMode(props));

  expect(props.onExitImmersiveMode).not.toHaveBeenCalled();
});
