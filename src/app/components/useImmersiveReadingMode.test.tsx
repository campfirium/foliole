import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import { useImmersiveReadingMode } from './useImmersiveReadingMode';

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

function buildProps() {
  let selection: EditorSelection = { from: 0, to: 0 };
  const content = 'Alpha\n\nBeta';
  const revealSelection = vi.fn((nextSelection: EditorSelection) => {
    selection = nextSelection;
  });
  const adapter = {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => content),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 100, scrollHeight: 100, scrollTop: 0 })),
    getScrollTop: vi.fn(() => 0),
    getSelection: vi.fn(() => selection),
    getSelectionRanges: vi.fn(() => [selection]),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection,
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setReadOnly: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn(),
    setSelectionRanges: vi.fn()
  };
  const onCreateSelectionHighlight = vi.fn(() => 'highlight-1');
  const onCreateSelectionNote = vi.fn(() => 'note-1');
  const onSelectNode = vi.fn();

  return {
    adapter,
    onCreateSelectionHighlight,
    onCreateSelectionNote,
    onSelectNode,
    props: {
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      isImmersiveMode: true,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') },
      onCreateSelectionHighlight,
      onCreateSelectionNote,
      onExitImmersiveMode: vi.fn(),
      onSelectNode,
      onToggleImmersiveMode: vi.fn(),
      trashedNodeIds: []
    } as never
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

it('toggles the shortcuts overlay with question mark', () => {
  const { props } = buildProps();
  const { result } = renderHook(() => useImmersiveReadingMode(props));

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }));
  });

  expect(result.current.isShortcutsOverlayOpen).toBe(true);
});
