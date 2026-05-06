import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemRegistry', () => ({
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
  const revealPosition = vi.fn();
  const revealSelectionAtViewportRatio = vi.fn();
  const setSelection = vi.fn();
  return {
    runtime: {
      editorRef: {
        current: {
          getScrollTop: vi.fn(() => 64),
          revealPosition,
          revealSelectionAtViewportRatio,
          revealSelection: vi.fn(),
          setSelection
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
    },
    testHarness: {
      revealPosition,
      revealSelectionAtViewportRatio,
      setSelection
    }
  } as const;
}

function createRevealPdfArgs() {
  return {
    runtime: {
      editorRef: {
        current: null
      },
      ...createRuntimeState(),
      isViewingTrashNode: false
    },
    ws: {
      activeNodeId: 'node-pdf-parent',
      nodesById: {
        'node-pdf-parent': {
          id: 'node-pdf-parent',
          parentNodeId: null,
          kind: 'topic',
          title: 'PDF Parent',
          content: 'Plain markdown content',
          anchorLink: null,
          reveal: null,
          review: null,
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z'
        }
      }
    }
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRevealAnchorInDocument text locator', () => {
  it('routes pdf locators when the current editor is unavailable', () => {
    const revealAnchorInDocument = createRevealAnchorInDocument(createRevealPdfArgs() as never);

    revealAnchorInDocument({ id: 'pdf-hl-2', kind: 'highlight', locator: { page: 7, x: 0.2, y: 0.2 } });
    revealAnchorInDocument({ id: 'pdf-hl-3', kind: 'highlight', locator: { page: 7, x: 0.9, y: 0.8 } });

    expect(requestPdfAnchorJump).toHaveBeenNthCalledWith(1, 'node-pdf-parent', { page: 7, x: 0.2, y: 0.2 });
    expect(requestPdfAnchorJump).toHaveBeenNthCalledWith(2, 'node-pdf-parent', { page: 7, x: 0.9, y: 0.8 });
  });

  it('reveals text locators directly from plain markdown content', () => {
    const content = 'Alpha Beta Gamma';
    const args = createRevealTextAnchorArgs(content);
    const revealAnchorInDocument = createRevealAnchorInDocument(args as never);

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
    expect(args.testHarness.setSelection).not.toHaveBeenCalled();
    expect(args.testHarness.revealPosition).not.toHaveBeenCalled();
    expect(args.testHarness.revealSelectionAtViewportRatio).not.toHaveBeenCalled();
    expect(args.runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
    expect(args.runtime.readingPositionRef.current).toEqual({
      nodeId: 'node-1',
      selection: {
        from: content.indexOf('Beta'),
        to: content.indexOf('Beta')
      }
    });
    expect(args.runtime.readingPositionSyncRef.current.state).toMatchObject({
      reason: 'reveal-anchor',
      targetSelection: {
        from: content.indexOf('Beta'),
        to: content.indexOf('Beta')
      }
    });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

  it('reveals an unresolved text locator as a zero-width position when the current plain-text content no longer matches', runUnresolvedRevealCase);
});

function runUnresolvedRevealCase() {
  const content = 'Start Legacy End';
  const args = createRevealTextAnchorArgs(content);
  const revealAnchorInDocument = createRevealAnchorInDocument(args as never);

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
  expect(args.testHarness.setSelection).not.toHaveBeenCalled();
  expect(args.testHarness.revealPosition).not.toHaveBeenCalled();
  expect(args.testHarness.revealSelectionAtViewportRatio).not.toHaveBeenCalled();
  expect(args.runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
  expect(args.runtime.readingPositionRef.current).toEqual({
    nodeId: 'node-1',
    selection: {
      from: 0,
      to: 0
    }
  });
  expect(args.runtime.readingPositionSyncRef.current.state).toMatchObject({
    reason: 'reveal-anchor',
    targetSelection: {
      from: 0,
      to: 0
    }
  });
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}
