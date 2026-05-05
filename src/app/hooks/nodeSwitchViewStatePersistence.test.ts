import { describe, expect, it, vi } from 'vitest';

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
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': createNode('node-1', 'Alpha', 'Alpha'),
        'node-2': createNode('node-2', 'Beta', 'Beta')
      },
      openNode: vi.fn(),
      trashedNodeIds: []
    }
  };
}

describe('node switch view-state persistence entrypoints', () => {
  it('routes search node opening through the shared navigation handler', () => {
    const args = createArgs();

    buildControllerSearchState(args).onOpenResult({
      excerpt: 'Beta',
      id: 'node-2',
      kind: 'node',
      pdfMatch: null,
      title: 'Beta',
      updatedAt: '2026-03-06T10:00:00.000Z'
    });

    expect(args.trash.closeTrashView).toHaveBeenCalledTimes(1);
    expect(args.nav.handleSelectNode).toHaveBeenCalledWith('node-2');
    expect(args.ws.openNode).not.toHaveBeenCalled();
    expect(args.runtime.setIsSearchPaletteOpen).toHaveBeenCalledWith(false);
  });

  it('routes go-to-node opening through the shared navigation handler', () => {
    const args = createArgs();

    buildControllerGoToNodeState(args).onOpenNode('node-2');

    expect(args.runtime.recordRecentNode).toHaveBeenCalledWith('node-2');
    expect(args.trash.closeTrashView).toHaveBeenCalledTimes(1);
    expect(args.nav.handleSelectNode).toHaveBeenCalledWith('node-2');
    expect(args.ws.openNode).not.toHaveBeenCalled();
    expect(args.runtime.setIsGoToNodePaletteOpen).toHaveBeenCalledWith(false);
  });
});
