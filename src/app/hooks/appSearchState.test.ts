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

it('opens the external preview panel for external search results', () => {
  const openExternalPreview = vi.fn();
  const setIsSearchPaletteOpen = vi.fn();
  const state = buildControllerSearchState({
    externalPreview: {
      openExternalPreview
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

  expect(openExternalPreview).toHaveBeenCalledWith({
    absolutePath: '/tmp/library/topic.md',
    folderId: 'folder-1'
  });
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
      closeVirtualView: () => undefined,
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
