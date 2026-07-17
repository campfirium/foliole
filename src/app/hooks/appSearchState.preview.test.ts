import { expect, it, vi } from 'vitest';

import { buildControllerSearchState } from './appSearchState';

function createArgs() {
  return {
    nav: { handleSelectNode: vi.fn() },
    runtime: {
      isSearchPaletteOpen: true,
      setIsSearchPaletteOpen: vi.fn()
    },
    searchPreview: {
      openSearchPreview: vi.fn()
    },
    trash: {
      closeTrashView: vi.fn()
    },
    virtualView: {
      restoreBrowseView: vi.fn()
    },
    ws: {
      nodeOrder: [],
      nodeViewById: {},
      nodesById: {} as never,
      setNodeViewState: vi.fn(),
      trashedNodeIds: []
    }
  };
}

it('routes modified node search results to the shared search preview', () => {
  const args = createArgs();
  const result = {
    excerpt: 'Preview body',
    externalMatch: null,
    id: 'node-1',
    kind: 'node' as const,
    nodeMatch: { from: 0, query: 'Preview', to: 7 },
    pdfMatch: null,
    title: 'Preview topic',
    updatedAt: '2026-05-17T00:00:00.000Z'
  };

  buildControllerSearchState(args).onOpenResult(result, { preview: true });

  expect(args.searchPreview.openSearchPreview).toHaveBeenCalledWith(result);
  expect(args.nav.handleSelectNode).not.toHaveBeenCalled();
  expect(args.ws.setNodeViewState).not.toHaveBeenCalled();
  expect(args.runtime.setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
});
