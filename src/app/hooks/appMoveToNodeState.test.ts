import { expect, it } from 'vitest';

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
      moveNode: () => true,
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
