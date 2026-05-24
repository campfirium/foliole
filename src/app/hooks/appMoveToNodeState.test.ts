import { expect, it, vi } from 'vitest';

import { buildControllerMoveToNodeState } from './appMoveToNodeState';

it('keeps move-to palette data empty while closed', () => {
  const state = buildControllerMoveToNodeState({
    runtime: {
      isMoveToNodePaletteOpen: false,
      recentNodeIds: [],
      recordRecentNode: () => undefined,
      setIsMoveToNodePaletteOpen: () => undefined
    } as never,
    ws: {
      activeNodeId: 'node-1',
      moveNode: async () => true,
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': {
          id: 'node-1',
          kind: 'topic',
          parentNodeId: null,
          title: 'Atlas',
          content: 'Body',
          reveal: null,
          review: null,
          createdAt: '',
          updatedAt: ''
        },
        'node-2': {
          id: 'node-2',
          kind: 'folder',
          parentNodeId: null,
          title: 'Shelf',
          content: '',
          reveal: null,
          review: null,
          createdAt: '',
          updatedAt: ''
        }
      },
      trashedNodeIds: []
    } as never
  });

  expect(state.isOpen).toBe(false);
  expect(state.nodeOrder).toEqual([]);
  expect(state.nodesById).toEqual({});
});

it('moves a frozen current-view source snapshot through the move-to palette', async () => {
  const closeMoveToNodePalette = vi.fn();
  const moveNodes = vi.fn().mockResolvedValue(true);
  const recordRecentNode = vi.fn();
  const state = buildControllerMoveToNodeState({
    runtime: {
      closeMoveToNodePalette,
      isMoveToNodePaletteOpen: true,
      moveToNodeSourceSnapshot: [
        { anchorLink: null, id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a' },
        { anchorLink: null, id: 'topic-b', kind: 'topic', parentNodeId: 'folder-a' },
        {
          anchorLink: { id: 'anchor-a', kind: 'highlight' },
          id: 'derived-a',
          kind: 'topic',
          parentNodeId: 'folder-a'
        }
      ],
      recentNodeIds: [],
      recordRecentNode,
      setIsMoveToNodePaletteOpen: () => undefined
    } as never,
    ws: {
      activeNodeId: null,
      moveNodes,
      nodeOrder: ['folder-a', 'topic-a', 'topic-child', 'topic-b', 'derived-a', 'folder-b'],
      nodesById: {
        'folder-a': createTestNode('folder-a', 'folder', null),
        'folder-b': createTestNode('folder-b', 'folder', null),
        'topic-a': createTestNode('topic-a', 'topic', 'folder-a'),
        'topic-b': createTestNode('topic-b', 'topic', 'folder-a'),
        'topic-child': createTestNode('topic-child', 'topic', 'topic-a'),
        'derived-a': {
          ...createTestNode('derived-a', 'topic', 'folder-a'),
          anchorLink: { id: 'anchor-a', kind: 'highlight' }
        }
      },
      trashedNodeIds: []
    } as never
  });

  expect(state.nodeOrder).toEqual(['folder-a', 'folder-b']);

  await state.onOpenNode('folder-b');

  expect(recordRecentNode).toHaveBeenCalledWith('folder-b');
  expect(moveNodes).toHaveBeenCalledWith(['topic-a', 'topic-b'], 'folder-b', 'child');
  expect(closeMoveToNodePalette).toHaveBeenCalledTimes(1);
});

function createTestNode(id: string, kind: 'folder' | 'topic' | 'item', parentNodeId: string | null) {
  return {
    anchorLink: null,
    content: '',
    createdAt: '',
    id,
    kind,
    parentNodeId,
    reveal: null,
    review: null,
    title: id,
    updatedAt: ''
  };
}
