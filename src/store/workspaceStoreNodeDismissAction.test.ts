import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createWorkspaceNodeActions dismiss', () => {
  it('marks pending reading nodes as dismissed from the node menu', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const state = harness.getState();
    const node = state.nodesById['node-1']!;
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...state.nodesById,
        'node-1': {
          ...node,
          kind: 'topic',
          reveal: 'Answer'
        }
      }
    });

    const dismissed = actions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');

    expect(dismissed).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading).toMatchObject({
      state: 'dismissed',
      repetitionCount: 0
    });
    expect(harness.getState().appActionHistory.undoStack).toHaveLength(1);
    expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({
      nodeId: 'node-1',
      title: 'Dismiss Topic',
      type: 'topic.dismiss'
    });
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        reading: expect.objectContaining({
          state: 'dismissed'
        })
      })
    );
  });

});

describe('createWorkspaceNodeActions dismiss descendants', () => {
  it('does not dismiss descendant reading topics from the node menu', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const state = harness.getState();
    const parent = state.nodesById['node-1']!;
    harness.setState({
      nodeOrder: [...state.nodeOrder, 'child-topic'],
      nodesById: {
        ...state.nodesById,
        'node-1': {
          ...parent,
          kind: 'topic',
          reveal: 'Answer'
        },
        'child-topic': {
          ...parent,
          id: 'child-topic',
          parentNodeId: 'node-1',
          title: 'Child topic',
          reading: {
            intervalDurationMs: 0,
            intervalGrowthFactor: 1,
            lastHandledAt: '2026-03-17T00:00:00.000Z',
            nextAt: '2026-03-17T00:00:00.000Z',
            priority: 0,
            readingPosition: 0,
            repetitionCount: 0,
            state: 'active'
          }
        }
      }
    });

    const dismissed = actions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');

    expect(dismissed).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading?.state).toBe('dismissed');
    expect(harness.getState().nodesById['child-topic']?.reading?.state).toBe('active');
  });
});

describe('createWorkspaceNodeActions dismiss no-op', () => {
  it('does not record history when dismiss is already a no-op', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const state = harness.getState();
    const node = state.nodesById['node-1']!;
    harness.setState({
      nodesById: {
        ...state.nodesById,
        'node-1': {
          ...node,
          kind: 'topic',
          reading: {
            intervalDurationMs: 0,
            intervalGrowthFactor: 1,
            lastHandledAt: '2026-03-18T00:00:00.000Z',
            nextAt: '2026-03-18T00:00:00.000Z',
            priority: 2,
            readingPosition: 0,
            repetitionCount: 0,
            state: 'dismissed'
          },
          reveal: 'Answer'
        }
      }
    });

    expect(actions.dismissNode('node-1', '2026-03-19T00:00:00.000Z')).toBe(false);
    expect(harness.getState().appActionHistory.undoStack).toEqual([]);
  });
});
