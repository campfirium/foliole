import { describe, expect, it, vi } from 'vitest';

const { requestPdfSearch } = vi.hoisted(() => ({
  requestPdfSearch: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemRegistry', () => ({
  requestPdfSearch
}));

import type { Node } from '../../features/nodes/model/nodeTypes';

import { buildControllerGoToNodeState } from './appGoToNodeState';
import { buildControllerSearchState } from './appSearchState';

function createNode(id: string, title: string, content: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title,
    content,
    reveal: null,
    review: null,
    createdAt: '2026-03-06T10:00:00.000Z',
    updatedAt: '2026-03-06T10:00:00.000Z'
  };
}

function createArgs() {
  return {
    nav: {
      handleSelectNode: vi.fn()
    },
    runtime: {
      recentNodeIds: ['node-1'],
      isGoToNodePaletteOpen: true,
      isSearchPaletteOpen: true,
      recordRecentNode: vi.fn(),
      setIsGoToNodePaletteOpen: vi.fn(),
      setIsSearchPaletteOpen: vi.fn()
    },
    trash: {
      closeTrashView: vi.fn()
    },
    ws: {
      nodeViewById: {},
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': createNode('node-1', 'Alpha', 'Alpha'),
        'node-2': createNode('node-2', 'Beta', 'Beta')
      },
      openNode: vi.fn(),
      setNodeViewState: vi.fn(),
      trashedNodeIds: []
    }
  };
}

function openNodeSearchResult(args: ReturnType<typeof createArgs>) {
  buildControllerSearchState(args).onOpenResult({
    excerpt: 'Beta',
    externalMatch: null,
    id: 'node-2',
    kind: 'node',
    nodeMatch: null,
    pdfMatch: null,
    title: 'Beta',
    updatedAt: '2026-03-06T10:00:00.000Z'
  });
}

function openBodyMatchResult(args: ReturnType<typeof createArgs>) {
  buildControllerSearchState(args).onOpenResult({
    excerpt: '...Beta...',
    externalMatch: null,
    id: 'node-2',
    kind: 'node',
    nodeMatch: { from: 4, query: 'beta', to: 8 },
    pdfMatch: null,
    title: 'Beta',
    updatedAt: '2026-03-06T10:00:00.000Z'
  });
}

function openPdfResult(args: ReturnType<typeof createArgs>) {
  buildControllerSearchState(args).onOpenResult({
    excerpt: '...keyword bridge...',
    externalMatch: null,
    id: 'node-2',
    kind: 'pdf',
    nodeMatch: null,
    pdfMatch: { attachmentId: 'att-1', matchStart: 12, page: 3, pageTextLength: 30, query: 'keyword' },
    title: 'Beta PDF',
    updatedAt: '2026-03-06T10:00:00.000Z'
  });
}

describe('node search view-state persistence', () => {
  it('routes search node opening through the shared navigation handler', () => {
    const args = createArgs();
    openNodeSearchResult(args);

    expect(args.trash.closeTrashView).toHaveBeenCalledTimes(1);
    expect(args.nav.handleSelectNode).toHaveBeenCalledWith('node-2');
    expect(args.ws.openNode).not.toHaveBeenCalled();
    expect(args.ws.setNodeViewState).not.toHaveBeenCalled();
    expect(args.runtime.setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
  });

  it('stores body match selection before opening a searched node result', () => {
    const args = createArgs();
    openBodyMatchResult(args);

    expect(args.ws.setNodeViewState).toHaveBeenCalledWith('node-2', {
      scrollTop: 0,
      selection: { from: 4, to: 8 }
    });
    expect(args.nav.handleSelectNode).toHaveBeenCalledWith('node-2');
  });
});

describe('node switch entrypoints', () => {
  it('routes go-to-node opening through the shared navigation handler', () => {
    const args = createArgs();
    buildControllerGoToNodeState(args).onOpenNode('node-2');

    expect(args.runtime.recordRecentNode).toHaveBeenCalledWith('node-2');
    expect(args.trash.closeTrashView).toHaveBeenCalledTimes(1);
    expect(args.nav.handleSelectNode).toHaveBeenCalledWith('node-2');
    expect(args.ws.openNode).not.toHaveBeenCalled();
    expect(args.runtime.setIsGoToNodePaletteOpen).toHaveBeenCalledWith(false);
  });

  it('routes pdf search result through node open + match targeting', () => {
    const args = createArgs();
    openPdfResult(args);

    expect(args.trash.closeTrashView).toHaveBeenCalledTimes(1);
    expect(args.nav.handleSelectNode).toHaveBeenCalledWith('node-2');
    expect(requestPdfSearch).toHaveBeenCalledWith('node-2', { matchStart: 12, page: 3, query: 'keyword' });
    expect(args.ws.openNode).not.toHaveBeenCalled();
    expect(args.runtime.setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
  });
});
