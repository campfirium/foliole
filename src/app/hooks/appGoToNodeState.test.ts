import { expect, it } from 'vitest';

import { buildControllerGoToNodeState } from './appGoToNodeState';

it('keeps go-to palette data empty while closed', () => {
  const state = buildControllerGoToNodeState({
    nav: {
      handleSelectNode: () => undefined
    },
    runtime: {
      isGoToNodePaletteOpen: false,
      recentNodeIds: [],
      recordRecentNode: () => undefined,
      setIsGoToNodePaletteOpen: () => undefined
    },
    trash: {
      closeTrashView: () => undefined
    },
    ws: {
      nodeOrder: ['node-1'],
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
        }
      } as never,
      trashedNodeIds: []
    }
  });

  expect(state.isOpen).toBe(false);
  expect(state.nodeOrder).toEqual([]);
  expect(state.nodesById).toEqual({});
});
