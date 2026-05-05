import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

import { createSelectNode } from './appControllerTrashViewHandlers';

describe('createSelectNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes highlight node selection to parent pdf node and queues locator jump', () => {
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
            anchorLink: { id: 'hl-1', kind: 'highlight', locator: { page: 3, x: 0.2, y: 0.7 } },
            parentNodeId: 'pdf-parent'
          }
        }
      }
    } as never);

    selectNode('highlight-node');

    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(handleSelectNode).toHaveBeenCalledWith('pdf-parent');
    expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 3, x: 0.2, y: 0.7 });
  });
});
