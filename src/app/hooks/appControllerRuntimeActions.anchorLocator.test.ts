import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

import { createRevealAnchorInDocument } from './appControllerRuntimeActions';

function createRuntimeState() {
  return {
    readingPositionRef: {
      current: { nodeId: null, selection: null }
    },
    readingPositionSyncRef: {
      current: { nodeId: null, state: null }
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRevealAnchorInDocument text locator', () => {
  it('reveals text locators without requiring inline anchor tags', () => {
    const revealSelection = vi.fn();
    const getScrollTop = vi.fn(() => 64);
    const setNodeViewState = vi.fn();
    const content = 'Alpha Beta Gamma';
    const revealAnchorInDocument = createRevealAnchorInDocument({
      runtime: {
        editorRef: {
          current: {
            getScrollTop,
            revealSelection
          }
        },
        ...createRuntimeState(),
        isViewingTrashNode: false
      },
      ws: {
        activeNodeId: 'node-1',
        nodeViewById: {
          'node-1': {
            scrollTop: 12,
            selection: { from: 1, to: 1 }
          }
        },
        nodesById: {
          'node-1': {
            id: 'node-1',
            parentNodeId: null,
            kind: 'topic',
            title: 'Parent',
            content,
            anchorLink: null,
            reveal: null,
            review: null,
            createdAt: '2026-04-05T00:00:00.000Z',
            updatedAt: '2026-04-05T00:00:00.000Z'
          }
        },
        setNodeViewState
      }
    } as never);

    revealAnchorInDocument({
      id: 'anchor-2',
      kind: 'highlight',
      locator: {
        from: content.indexOf('Beta'),
        originalText: 'Beta',
        to: content.indexOf('Beta') + 'Beta'.length
      }
    });

    expect(revealSelection).toHaveBeenCalledWith({
      from: content.indexOf('Beta'),
      to: content.indexOf('Beta') + 'Beta'.length
    });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });
});
