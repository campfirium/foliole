import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import {
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeToRuntime: vi.fn(),
  syncCreateNodeMutationToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));
vi.mock('../shared/platform/runtime/nodeReadingStateRuntimeRepository', () => ({
  saveNodeReadingStateToRuntime: vi.fn(async () => true)
}));

function createReadingProfile(overrides: Partial<NodeReadingProfile> = {}): NodeReadingProfile {
  return {
    intervalDurationMs: 86_400_000,
    intervalGrowthFactor: 1.8,
    lastHandledAt: '2026-03-01T00:00:00.000Z',
    nextAt: '2026-03-02T00:00:00.000Z',
    priority: 2,
    readingPosition: 0.42,
    repetitionCount: 3,
    state: 'active' as const,
    ...overrides
  };
}

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  const node = fixture.nodesById['node-1']!;
  return createWorkspaceNodeActionsSetStateHarness({
    ...fixture,
    nodesById: {
      ...fixture.nodesById,
      'node-1': {
        ...node,
        kind: 'topic',
        reading: createReadingProfile(),
        reveal: 'Answer'
      }
    }
  });
}

describe('workspace application action history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records Dismiss Topic with the full before and after reading profile', () => {
    const harness = createHarness();
    const actions = createWorkspaceNodeActions(harness.setState);
    const beforeReading = harness.getState().nodesById['node-1']?.reading;

    expect(actions.dismissNode('node-1', '2026-03-18T00:00:00.000Z')).toBe(true);

    const entry = harness.getState().appActionHistory.undoStack[0];
    expect(entry).toMatchObject({
      beforeReading,
      nodeId: 'node-1',
      title: 'Dismiss Topic',
      type: 'topic.dismiss'
    });
    if (entry?.type !== 'topic.dismiss') {
      throw new Error('Expected topic dismiss history entry');
    }
    expect(entry?.afterReading).toMatchObject({
      lastHandledAt: '2026-03-18T00:00:00.000Z',
      state: 'dismissed'
    });
    expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  });

  it('undoes and redoes Dismiss Topic without losing reading schedule fields', () => {
    const harness = createHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
    const beforeReading = harness.getState().nodesById['node-1']?.reading;
    const modifiedAt = harness.getState().nodesById['node-1']?.updatedAt;

    nodeActions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');
    const afterReading = harness.getState().nodesById['node-1']?.reading;

    expect(historyActions.undoWorkspaceAction('2026-03-19T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading).toEqual(beforeReading);
    expect(harness.getState().nodesById['node-1']?.updatedAt).toBe(modifiedAt);
    expect(saveNodeReadingStateToRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({ nodeId: 'node-1', reading: beforeReading })
    );

    expect(historyActions.redoWorkspaceAction('2026-03-20T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading).toEqual(afterReading);
    expect(harness.getState().nodesById['node-1']?.updatedAt).toBe(modifiedAt);
  });

  it('returns to the restored topic after undoing Dismiss Topic', () => {
    const harness = createHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);

    nodeActions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');
    harness.setState({ activeNodeId: 'special-inbox' });

    expect(historyActions.undoWorkspaceAction('2026-03-19T00:00:00.000Z')).toBe(true);

    expect(harness.getState().activeNodeId).toBe('node-1');
    expect(harness.getState().nodeViewById['node-1']).toBeUndefined();
  });
});

describe('workspace application delete action history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores a deleted current review topic and session position when undoing Delete Topic', async () => {
    const harness = createHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
    const secondNode = {
      ...harness.getState().nodesById['node-1']!,
      content: 'Second',
      id: 'node-2',
      title: 'Second'
    };
    harness.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: [...state.nodeOrder, 'node-2'],
      nodesById: {
        ...state.nodesById,
        'node-2': secondNode
      },
      reviewSession: {
        currentNodeId: 'node-1',
        isAnswerRevealed: true,
        queueNodeIds: ['node-1', 'node-2'],
        totalNodeCount: 2
      }
    }));

    vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementation(async (payload) => ({ deletedNodeIds: payload.nodeIds }));
    await nodeActions.deleteNode('node-1');

    expect(harness.getState().activeNodeId).toBe('node-2');
    expect(harness.getState().reviewSession.currentNodeId).toBe('node-2');
    expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({
      nodeIds: ['node-1'],
      title: 'Delete Topic',
      type: 'topic.delete'
    });

    expect(historyActions.undoWorkspaceAction('2026-03-19T00:00:00.000Z')).toBe(true);

    expect(harness.getState().trashedNodeIds).not.toContain('node-1');
    expect(harness.getState().activeNodeId).toBe('node-1');
    expect(harness.getState().reviewSession).toMatchObject({
      currentNodeId: 'node-1',
      isAnswerRevealed: true,
      queueNodeIds: ['node-1', 'node-2'],
      totalNodeCount: 2
    });
    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: ['node-1'] });

    expect(historyActions.redoWorkspaceAction('2026-03-20T00:00:00.000Z')).toBe(true);

    expect(harness.getState().trashedNodeIds).toContain('node-1');
    expect(harness.getState().activeNodeId).toBe('node-2');
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenLastCalledWith({
      deletedAt: expect.any(String),
      nodeIds: ['node-1']
    });
  });
});

describe('workspace application action history conflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not overwrite a topic whose reading profile changed after dismiss', () => {
    const harness = createHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);

    nodeActions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');
    const state = harness.getState();
    const node = state.nodesById['node-1']!;
    harness.setState({
      nodesById: {
        ...state.nodesById,
        'node-1': {
          ...node,
          reading: createReadingProfile({ lastHandledAt: '2026-03-19T00:00:00.000Z' })
        }
      }
    });

    expect(historyActions.undoWorkspaceAction('2026-03-20T00:00:00.000Z')).toBe(false);
    expect(harness.getState().nodesById['node-1']?.reading).toMatchObject({
      lastHandledAt: '2026-03-19T00:00:00.000Z',
      state: 'active'
    });
    expect(harness.getState().appActionHistory.undoStack).toEqual([]);
  });

  it('drops an undo entry for a trashed topic instead of keeping a stuck stack top', () => {
    const harness = createHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);

    nodeActions.dismissNode('node-1', '2026-03-18T00:00:00.000Z');
    harness.setState({ trashedNodeIds: ['node-1'] });

    expect(historyActions.undoWorkspaceAction('2026-03-20T00:00:00.000Z')).toBe(false);
    expect(harness.getState().appActionHistory.undoStack).toEqual([]);
    expect(saveNodeReadingStateToRuntime).toHaveBeenCalledTimes(1);
  });
});
