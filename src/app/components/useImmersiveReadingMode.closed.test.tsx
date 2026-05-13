import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

const immersiveReadingNodesMocks = vi.hoisted(() => ({
  getReadableNodeIds: vi.fn(() => ['node-1'])
}));

vi.mock('./immersiveReadingNodes', async () => {
  const actual = await vi.importActual<typeof import('./immersiveReadingNodes')>('./immersiveReadingNodes');
  return {
    ...actual,
    getReadableNodeIds: immersiveReadingNodesMocks.getReadableNodeIds
  };
});

import { useImmersiveReadingMode } from './useImmersiveReadingMode';

type ImmersiveProps = Parameters<typeof useImmersiveReadingMode>[0];

function createNode(id: string, kind: 'folder' | 'topic' = 'topic') {
  return {
    anchorLink: null,
    content: '',
    createdAt: '',
    id,
    kind,
    parentNodeId: null,
    reveal: '',
    review: null,
    title: id,
    updatedAt: ''
  };
}

function buildAdapter() {
  let selection: EditorSelection = { from: 0, to: 0 };
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Alpha'),
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
    revealSelection: vi.fn(),
    revealSelectionAtViewportRatio: vi.fn(),
    restoreSelection: vi.fn(),
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

it('skips readable node scanning while immersive mode is closed', () => {
  const adapter = buildAdapter();
  renderHook(() =>
    useImmersiveReadingMode({
      activeNodeId: 'node-1',
      editorAdapterRef: { current: adapter },
      editorNodeViewState: undefined,
      isImmersiveMode: false,
      isStudyMode: false,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: { 'node-1': createNode('node-1'), 'node-2': createNode('node-2', 'folder') },
      onCreateSelectionHighlight: vi.fn(),
      onToggleSelectionHighlight: vi.fn(() => 'created' as const),
      onCreateSelectionNote: vi.fn(),
      onExitImmersiveMode: vi.fn(),
      onRevealDocumentSelection: vi.fn(),
      beginApplyingReadingPosition: vi.fn(),
      completeApplyingReadingPosition: vi.fn(),
      getReadingPositionSelection: () => null,
      getReadingPositionSyncState: () => null,
      setReadingPositionSelection: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleImmersiveMode: vi.fn(),
      trashedNodeIds: []
    } as ImmersiveProps)
  );

  expect(immersiveReadingNodesMocks.getReadableNodeIds).not.toHaveBeenCalled();
});
