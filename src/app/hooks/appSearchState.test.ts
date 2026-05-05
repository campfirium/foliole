import { expect, it } from 'vitest';

import { buildControllerSearchState } from './appSearchState';

it('keeps search palette data empty while closed', () => {
  const state = buildControllerSearchState({
    nav: {
      handleSelectNode: () => undefined
    },
    runtime: {
      isSearchPaletteOpen: false,
      setIsSearchPaletteOpen: () => undefined
    },
    trash: {
      closeTrashView: () => undefined
    },
    ws: {
      nodeOrder: ['node-1'],
      nodeViewById: {},
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
      setNodeViewState: () => undefined,
      trashedNodeIds: []
    }
  });

  expect(state.isOpen).toBe(false);
  expect(state.nodeOrder).toEqual([]);
  expect(state.nodesById).toEqual({});
});
