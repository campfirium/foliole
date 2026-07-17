import { expect, it, vi } from 'vitest';

import { buildControllerSearchState } from './appSearchState';

it('opens imported external search results as internal Topics', () => {
  const handleSelectNode = vi.fn();
  const openExternalSelection = vi.fn();
  const openSearchPreview = vi.fn();
  const setIsSearchPaletteOpen = vi.fn();
  const state = buildControllerSearchState({
    externalLibrary: {
      openExternalSelection
    },
    searchPreview: {
      openSearchPreview
    },
    nav: {
      handleSelectNode
    },
    runtime: {
      isSearchPaletteOpen: true,
      setIsSearchPaletteOpen
    },
    trash: {
      closeTrashView: () => undefined
    },
    virtualView: {
      restoreBrowseView: () => undefined
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
      importedNodeId: 'node-imported',
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

  expect(handleSelectNode).toHaveBeenCalledWith('node-imported');
  expect(openExternalSelection).not.toHaveBeenCalled();
  expect(openSearchPreview).not.toHaveBeenCalled();
  expect(setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
});
