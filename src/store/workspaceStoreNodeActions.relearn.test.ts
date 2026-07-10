import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntime, syncRelearnNodeToRuntime } from './workspaceRuntimeSync';
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
  syncRelearnNodeToRuntime: vi.fn(() => true),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets item review cards to an uninitialized state and syncs runtime reset', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const seedNodeId = (await actions.createRootNode(''))!;
    const state = harness.getState();
    const node = state.nodesById[seedNodeId];
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...state.nodesById,
        [seedNodeId]: {
          ...node,
          content: 'Prompt',
          hasContent: true,
          kind: 'item',
          reveal: 'Answer',
          hasReveal: true,
          review: {
            due: '2026-03-10T00:00:00.000Z',
            lastReviewAt: '2026-03-06T00:00:00.000Z',
            state: 2,
            stability: 7,
            difficulty: 4,
            elapsedDays: 2,
            scheduledDays: 4,
            reps: 5,
            lapses: 1
          }
        }
      }
    });

    const relearned = actions.relearnNode(seedNodeId, '2026-03-18T00:00:00.000Z');

    expect(relearned).toBe(true);
    expect(harness.getState().nodesById[seedNodeId]?.review).toBeNull();
    expect(syncRelearnNodeToRuntime).toHaveBeenCalledWith({ nodeId: seedNodeId });
  });

  it('keeps item review state when durable relearn staging fails', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const seedNodeId = (await actions.createRootNode('Prompt', 'item'))!;
    const node = harness.getState().nodesById[seedNodeId]!;
    harness.setState({ nodesById: { ...harness.getState().nodesById, [seedNodeId]: { ...node, reveal: 'Answer' } } });
    vi.mocked(syncRelearnNodeToRuntime).mockReturnValueOnce(false);

    expect(actions.relearnNode(seedNodeId, '2026-03-18T00:00:00.000Z')).toBe(false);
    expect(harness.getState().nodesById[seedNodeId]?.review).toEqual(node.review);
  });

  it('accepts ordinary empty topics without creating progress or sync work', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const before = harness.getState().nodesById['node-1'];
    if (!before) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': {
          ...before,
          content: '',
          hasContent: false,
          reading: null,
          review: null
        }
      }
    });

    const relearned = actions.relearnNode('node-1', '2026-03-18T00:00:00.000Z');

    expect(relearned).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading).toBeNull();
    expect(harness.getState().nodesById['node-1']?.review).toBeNull();
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncRelearnNodeToRuntime).not.toHaveBeenCalled();
  });

  it('clears a shelved topic when relearning it', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const node = harness.getState().nodesById['node-1']!;
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': {
          ...node,
          reading: {
            intervalDurationMs: 0,
            intervalGrowthFactor: 1,
            lastHandledAt: '2026-03-10T00:00:00.000Z',
            nextAt: '2026-03-10T00:00:00.000Z',
            priority: 0,
            readingPosition: 0,
            repetitionCount: 0,
            state: 'dismissed'
          },
          shelvedAt: '2026-05-01T00:00:00.000Z'
        }
      }
    });

    expect(actions.relearnNode('node-1', '2026-05-02T00:00:00.000Z')).toBe(true);

    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull();
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(expect.objectContaining({ id: 'node-1', shelvedAt: null }));
  });
