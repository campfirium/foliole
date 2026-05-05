import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createReadingPositionHandlers } from './appControllerReadingPosition';

function createHarness() {
  const readingPositionRef = {
    current: {
      nodeId: 'node-1',
      selection: null as { from: number; to: number } | null
    }
  };
  const readingPositionSyncRef = {
    current: {
      nodeId: 'node-1',
      state: null as
        | null
        | {
            reason: string;
            startedAt: number;
            targetSelection: { from: number; to: number };
            targetViewportRatio?: number;
          }
    }
  };

  const handlers = createReadingPositionHandlers({
    runtime: {
      readingPositionRef,
      readingPositionSyncRef
    },
    ws: {
      activeNodeId: 'node-1'
    }
  } as never);

  return { handlers, readingPositionRef };
}

describe('createReadingPositionHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears an anchor-navigation request after the matching restore completes', () => {
    const { handlers, readingPositionRef } = createHarness();

    handlers.beginAnchorNavigationRestore('node-1', { from: 42, to: 42 });
    readingPositionRef.current.selection = { from: 42, to: 42 };
    handlers.getReadingPositionSyncState()!.targetViewportRatio = 0.24;

    handlers.completeApplyingReadingPosition('editor-restore-selection-settled', { from: 42, to: 42 });

    expect(handlers.getReadingPositionSyncState()).toBeNull();
    expect(handlers.getReadingPositionSelection()).toEqual({ from: 42, to: 42 });
  });

  it('does not let a stale completion clear a fresh anchor-navigation request', () => {
    const { handlers } = createHarness();

    handlers.beginAnchorNavigationRestore('node-1', { from: 88, to: 88 });
    handlers.getReadingPositionSyncState()!.targetViewportRatio = 0.24;

    handlers.completeApplyingReadingPosition('editor-restore-selection-cancelled', { from: 21, to: 21 });

    expect(handlers.getReadingPositionSyncState()).toMatchObject({
      reason: 'anchor-navigation',
      targetSelection: { from: 88, to: 88 },
      targetViewportRatio: 0.24
    });
  });
});
