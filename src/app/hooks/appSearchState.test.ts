import { expect, it, vi } from 'vitest';

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

it('opens the external library view for external search results', () => {
  const openExternalDocument = vi.fn();
  const setIsSearchPaletteOpen = vi.fn();
  const state = buildControllerSearchState({
    externalView: {
      openExternalDocument
    },
    nav: {
      handleSelectNode: () => undefined
    },
    runtime: {
      isSearchPaletteOpen: true,
      setIsSearchPaletteOpen
    },
    trash: {
      closeTrashView: () => undefined
    },
    virtualView: {
      closeVirtualView: () => undefined
    },
    ws: {
      nodeOrder: [],
      nodeViewById: {},
      nodesById: {} as never,
      setNodeViewState: () => undefined,
      trashedNodeIds: []
    }
  });

  state.onOpenResult({
    excerpt: '...',
    externalMatch: {
      absolutePath: '/tmp/library/topic.md',
      folderId: 'folder-1',
      folderPath: '/tmp/library',
      query: 'topic',
      relativePath: 'topic.md'
    },
    id: '/tmp/library/topic.md',
    kind: 'external',
    nodeMatch: null,
    pdfMatch: null,
    title: 'topic.md',
    updatedAt: '2026-04-21T00:00:00.000Z'
  });

  expect(openExternalDocument).toHaveBeenCalledWith({
    absolutePath: '/tmp/library/topic.md',
    folderId: 'folder-1'
  });
  expect(setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
});
