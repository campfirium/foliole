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
    bumpReadingPositionRequest: vi.fn(),
    readingPositionRef: {
      current: { nodeId: null, selection: null }
    },
    readingPositionSyncRef: {
      current: { nodeId: null, state: null }
    }
  };
}

function createRevealTextAnchorArgs(content: string) {
  return {
    runtime: {
      editorRef: {
        current: {
          getScrollTop: vi.fn(() => 64),
          revealSelection: vi.fn()
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
      setNodeViewState: vi.fn()
    }
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRevealAnchorInDocument text locator', () => {
  it('reveals text locators directly from plain markdown content', () => {
    const content = 'Alpha Beta Gamma';
    const args = createRevealTextAnchorArgs(content);
    const revealAnchorInDocument = createRevealAnchorInDocument(args);

    revealAnchorInDocument({
      id: 'anchor-2',
      kind: 'highlight',
      locator: {
        from: content.indexOf('Beta'),
        originalText: 'Beta',
        to: content.indexOf('Beta') + 'Beta'.length
      }
    });

    expect(args.runtime.editorRef.current.revealSelection).not.toHaveBeenCalled();
    expect(args.ws.setNodeViewState).not.toHaveBeenCalled();
    expect(args.runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
    expect(args.runtime.readingPositionRef.current).toEqual({
      nodeId: 'node-1',
      selection: {
        from: content.indexOf('Beta'),
        to: content.indexOf('Beta') + 'Beta'.length
      }
    });
    expect(args.runtime.readingPositionSyncRef.current.state).toMatchObject({
      reason: 'reveal-anchor',
      targetSelection: {
        from: content.indexOf('Beta'),
        to: content.indexOf('Beta') + 'Beta'.length
      }
    });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

  it('reveals an unresolved text locator as a zero-width position when the current plain-text content no longer matches', runUnresolvedRevealCase);
});

function runUnresolvedRevealCase() {
  const content = 'Start Legacy End';
  const args = createRevealTextAnchorArgs(content);
  const revealAnchorInDocument = createRevealAnchorInDocument(args);

  revealAnchorInDocument({
    id: 'anchor-2',
    kind: 'highlight',
    locator: {
      from: 0,
      originalText: 'Beta',
      to: 4
    }
  });

  expect(args.runtime.editorRef.current.revealSelection).not.toHaveBeenCalled();
  expect(args.ws.setNodeViewState).not.toHaveBeenCalled();
  expect(args.runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
  expect(args.runtime.readingPositionRef.current).toEqual({
    nodeId: 'node-1',
    selection: {
      from: 0,
      to: 4
    }
  });
  expect(args.runtime.readingPositionSyncRef.current.state).toMatchObject({
    reason: 'reveal-anchor',
    targetSelection: {
      from: 0,
      to: 4
    }
  });
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}
