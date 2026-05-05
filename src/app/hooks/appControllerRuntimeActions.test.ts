import { describe, expect, it, vi } from 'vitest';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

import {
  createPersistPdfViewState,
  createRevealDocumentPosition,
  createRevealDocumentSelection
} from './appControllerRuntimeActions';

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

function createRevealDocumentPositionArgs(args: {
  getScrollTop?: () => number;
  revealPosition?: (position: number) => void;
  revealSelectionNearest?: ReturnType<typeof vi.fn>;
  revealSelectionAtViewportRatio?: ReturnType<typeof vi.fn>;
  revealSelection?: ReturnType<typeof vi.fn>;
  restoreSelection?: ReturnType<typeof vi.fn>;
  setSelection?: ReturnType<typeof vi.fn>;
  setNodeViewState: ReturnType<typeof vi.fn>;
}) {
  return {
    runtime: {
      editorRef: {
        current: {
          getScrollTop: args.getScrollTop ?? (() => 0),
          revealPosition: args.revealPosition ?? (() => undefined),
          revealSelectionNearest: args.revealSelectionNearest,
          revealSelectionAtViewportRatio: args.revealSelectionAtViewportRatio,
          revealSelection: args.revealSelection ?? vi.fn(),
          restoreSelection: args.restoreSelection ?? vi.fn(),
          setSelection: args.setSelection ?? vi.fn()
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

function expectNearestReadingRequest(args: {
  runtimeArgs: ReturnType<typeof createRevealDocumentPositionArgs>;
  restoreSelection: ReturnType<typeof vi.fn>;
  setNodeViewState: ReturnType<typeof vi.fn>;
}) {
  expect(args.setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 0,
    selection: { from: 3, to: 125 }
  });
  expect(args.restoreSelection).toHaveBeenCalledWith({ from: 3, to: 125 });
  expect(args.runtimeArgs.runtime.readingPositionSyncRef.current.state).toMatchObject({
    reason: 'reveal-selection',
    targetSelection: { from: 3, to: 125 },
    targetViewportMode: 'nearest'
  });
}

it('updates the stored reading position before applying the reading anchor request', () => {
  const revealPosition = vi.fn();
  const setSelection = vi.fn();
  const getScrollTop = vi.fn(() => 320);
  const setNodeViewState = vi.fn();

  const args = createRevealDocumentPositionArgs({
    getScrollTop,
    revealPosition,
    setNodeViewState,
    setSelection
  }) as never;
  const revealDocumentPosition = createRevealDocumentPosition(args);

  revealDocumentPosition(48000);

  expect(args.runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
  expect(args.runtime.readingPositionRef.current).toEqual({
    nodeId: 'node-1',
    selection: { from: 48000, to: 48000 }
  });
  expect(setNodeViewState).toHaveBeenCalledWith('node-1', {
    scrollTop: 320,
    selection: { from: 48000, to: 48000 }
  });
  expect(setSelection).toHaveBeenCalledWith({ from: 48000, to: 48000 });
  expect(revealPosition).toHaveBeenCalledWith(48000);
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

it('applies nearest selection reveal through the shared reading request path', () => {
  const restoreSelection = vi.fn();
  const setNodeViewState = vi.fn();
  const runtimeArgs = createRevealDocumentPositionArgs({
    restoreSelection,
    setNodeViewState,
  }) as never;

  const revealDocumentSelection = createRevealDocumentSelection(runtimeArgs);
  revealDocumentSelection({ from: 3, to: 125 }, 'nearest');

  expectNearestReadingRequest({
    runtimeArgs,
    restoreSelection,
    setNodeViewState
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
