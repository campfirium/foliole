import { describe, expect, it, vi } from 'vitest';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

import {
  createPersistPdfViewState,
  createRevealAnchorInDocument,
  createRevealDocumentPosition,
  createRevealDocumentSelection
} from './appControllerRuntimeActions';

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

function createRevealDocumentPositionArgs(args: {
  getScrollTop?: () => number;
  revealPosition?: (position: number) => void;
  setNodeViewState: ReturnType<typeof vi.fn>;
}) {
  return {
    runtime: {
      editorRef: {
        current: {
          getScrollTop: args.getScrollTop ?? (() => 0),
          revealPosition: args.revealPosition ?? (() => undefined)
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
      setNodeViewState: args.setNodeViewState
    }
  };
}

describe('createRevealDocumentPosition', () => {
  it('stores the revealed document position as the new reading anchor', () => {
    const revealPosition = vi.fn();
    const getScrollTop = vi.fn(() => 320);
    const setNodeViewState = vi.fn();

    const revealDocumentPosition = createRevealDocumentPosition(
      createRevealDocumentPositionArgs({ getScrollTop, revealPosition, setNodeViewState }) as never
    );

    revealDocumentPosition(48000);

    expect(revealPosition).toHaveBeenCalledWith(48000);
    expect(setNodeViewState).toHaveBeenCalledWith('node-1', {
      scrollTop: 320,
      selection: { from: 48000, to: 48000 }
    });
  });

  it('still stores selection when editor adapter is unavailable', () => {
    const setNodeViewState = vi.fn();
    const runtimeState = createRuntimeState();

    const revealDocumentSelection = createRevealDocumentSelection({
      runtime: {
        editorRef: {
          current: null
        },
        ...runtimeState,
        isViewingTrashNode: false
      },
      ws: {
        activeNodeId: 'node-1',
        nodeViewById: {
          'node-1': {
            scrollTop: 24,
            selection: { from: 1, to: 1 }
          }
        },
        setNodeViewState
      }
    } as never);

    revealDocumentSelection({ from: 3, to: 125 });

    expect(setNodeViewState).toHaveBeenCalledWith('node-1', {
      scrollTop: 24,
      selection: { from: 3, to: 125 }
    });
  });
});

describe('createRevealAnchorInDocument', () => {
  it('routes to pdf locator jump when editor adapter is unavailable', () => {
    const runtimeState = createRuntimeState();
    const revealAnchorInDocument = createRevealAnchorInDocument({
      runtime: {
        editorRef: {
          current: null
        },
        ...runtimeState,
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
            content: 'No inline anchor tags',
            anchorLink: null,
            reveal: null,
            review: null,
            createdAt: '2026-04-05T00:00:00.000Z',
            updatedAt: '2026-04-05T00:00:00.000Z'
          }
        }
      }
    } as never);

    revealAnchorInDocument({ id: 'pdf-hl-2', kind: 'highlight', locator: { page: 7, x: 0.2, y: 0.2 } });
    revealAnchorInDocument({ id: 'pdf-hl-3', kind: 'highlight', locator: { page: 7, x: 0.9, y: 0.8 } });

    expect(requestPdfAnchorJump).toHaveBeenNthCalledWith(1, 'node-pdf-parent', { page: 7, x: 0.2, y: 0.2 });
    expect(requestPdfAnchorJump).toHaveBeenNthCalledWith(2, 'node-pdf-parent', { page: 7, x: 0.9, y: 0.8 });
  });
});

describe('createPersistPdfViewState', () => {
  it('writes pdf view state for the provided node', () => {
    const setNodeViewState = vi.fn();
    const runtimeState = createRuntimeState();
    const persistPdfViewState = createPersistPdfViewState({
      runtime: {
        ...runtimeState,
        isViewingTrashNode: false
      },
      ws: {
        setNodeViewState
      }
    } as never);

    persistPdfViewState('node-7', {
      scrollTop: 7,
      selection: { from: 7, to: 120 }
    });

    expect(setNodeViewState).toHaveBeenCalledWith('node-7', {
      scrollTop: 7,
      selection: { from: 7, to: 120 }
    });
  });

  it('skips persistence when viewing trash node', () => {
    const setNodeViewState = vi.fn();
    const runtimeState = createRuntimeState();
    const persistPdfViewState = createPersistPdfViewState({
      runtime: {
        ...runtimeState,
        isViewingTrashNode: true
      },
      ws: {
        setNodeViewState
      }
    } as never);

    persistPdfViewState('node-1', {
      scrollTop: 2,
      selection: { from: 2, to: 100 }
    });

    expect(setNodeViewState).not.toHaveBeenCalled();
  });
});
