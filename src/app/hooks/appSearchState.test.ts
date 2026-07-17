import { expect, it, vi } from 'vitest';

import { getSelectedRemovedSource, setSelectedRemovedSource } from '../components/removedSourceSelectionStore';

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

function createExternalResult() {
  return {
    excerpt: '...',
    externalMatch: {
      absolutePath: '/tmp/library/topic.md',
      folderId: 'folder-1',
      folderPath: '/tmp/library',
      query: 'topic',
      relativePath: 'topic.md'
    },
    id: '/tmp/library/topic.md',
    kind: 'external' as const,
    nodeMatch: null,
    pdfMatch: null,
    title: 'topic.md',
    updatedAt: '2026-04-21T00:00:00.000Z'
  };
}

it('opens external search results in the external library by default', () => {
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

  state.onOpenResult(createExternalResult());

  expect(openExternalSelection).toHaveBeenCalledWith({
    absolutePath: '/tmp/library/topic.md',
    folderId: 'folder-1',
    kind: 'document'
  });
  expect(openSearchPreview).not.toHaveBeenCalled();
  expect(setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
});

it('opens the search preview panel for modified external search results', () => {
  const openSearchPreview = vi.fn();
  const openExternalSelection = vi.fn();
  const setIsSearchPaletteOpen = vi.fn();
  const state = buildControllerSearchState({
    externalLibrary: {
      openExternalSelection
    },
    searchPreview: {
      openSearchPreview
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

  state.onOpenResult(createExternalResult(), { preview: true });

  expect(openSearchPreview).toHaveBeenCalledWith(createExternalResult());
  expect(openExternalSelection).not.toHaveBeenCalled();
  expect(setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
});

it('opens the Removed virtual view for removed search results', () => {
  setSelectedRemovedSource(null);
  const openVirtualView = vi.fn();
  const setIsSearchPaletteOpen = vi.fn();
  const entry = {
    content: 'Removed body',
    contentPreview: 'Removed body',
    deletedAt: '2026-05-12T00:00:00.000Z',
    firstSeenAt: '2026-05-12T00:00:00.000Z',
    hasSourceUpdate: false,
    id: 'rule-1:/Readwise/Removed.md',
    lastImportedAt: '2026-05-12T00:00:00.000Z',
    lastNodeId: 'topic-old',
    ruleId: 'rule-1',
    sourcePath: '/Readwise/Removed.md',
    title: 'Removed launch'
  };
  const state = buildControllerSearchState({
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
      restoreBrowseView: () => undefined,
      openVirtualView
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
    excerpt: 'Removed body',
    externalMatch: null,
    id: entry.id,
    kind: 'removed',
    nodeMatch: null,
    pdfMatch: null,
    removedMatch: { entry, query: 'launch' },
    title: entry.title,
    updatedAt: entry.deletedAt
  });

  expect(getSelectedRemovedSource()).toBe(entry);
  expect(openVirtualView).toHaveBeenCalledWith('special-virtual-removed');
  expect(setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
});
