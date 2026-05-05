import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

import { createSelectNode } from './appControllerTrashViewHandlers';

function createSelectNodeHarness(args: {
  anchorLink: {
    id: string;
    kind: 'highlight' | 'cloze';
    locator: { from: number; originalText: string; to: number } | { page: number; x: number; y: number };
  };
  parentNodeId: string;
}) {
  const handleSelectNode = vi.fn();
  const closeVirtualView = vi.fn();
  const setIsViewingTrashNode = vi.fn();

  const selectNode = createSelectNode({
    nav: { handleSelectNode },
    runtime: { setIsViewingTrashNode },
    virtualView: { closeVirtualView },
    ws: {
      nodesById: {
        'highlight-node': {
          anchorLink: args.anchorLink,
          parentNodeId: args.parentNodeId
        }
      }
    }
  } as never);

  return { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode };
}

describe('createSelectNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes highlight node selection to parent pdf node and queues locator jump', () => {
    const { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode } = createSelectNodeHarness({
      anchorLink: { id: 'hl-1', kind: 'highlight', locator: { page: 3, x: 0.2, y: 0.7 } },
      parentNodeId: 'pdf-parent'
    });

    selectNode('highlight-node');

    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(handleSelectNode).toHaveBeenCalledWith('pdf-parent');
    expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 3, x: 0.2, y: 0.7 });
  });

  it('routes text highlight node selection to parent node with anchor focus', () => {
    const { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode } = createSelectNodeHarness({
      anchorLink: {
        id: 'hl-2',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      parentNodeId: 'text-parent'
    });

    selectNode('highlight-node');

    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(handleSelectNode).toHaveBeenCalledWith(
      'text-parent',
      expect.objectContaining({
        id: 'hl-2',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      })
    );
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

  it('routes text cloze node selection to parent node with anchor focus', () => {
    const { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode } = createSelectNodeHarness({
      anchorLink: {
        id: 'cloze-2',
        kind: 'cloze',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      parentNodeId: 'text-parent'
    });

    selectNode('highlight-node');

    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(handleSelectNode).toHaveBeenCalledWith(
      'text-parent',
      expect.objectContaining({
        id: 'cloze-2',
        kind: 'cloze',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      })
    );
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });
});
