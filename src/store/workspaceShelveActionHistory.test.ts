import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createStartedReviewSession } from './workspaceReviewReading';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
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

function createReadingProfile(overrides: Partial<NodeReadingProfile> = {}): NodeReadingProfile {
  return {
    intervalDurationMs: 86_400_000,
    intervalGrowthFactor: 1.8,
    lastHandledAt: '2026-03-01T00:00:00.000Z',
    nextAt: '2026-03-02T00:00:00.000Z',
    priority: 2,
    readingPosition: 0.42,
    repetitionCount: 3,
    state: 'active',
    ...overrides
  };
}

function createShelveHarness() {
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

function createSequentialHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  const seed = fixture.nodesById['node-1']!;
  const source: Node = {
    ...seed,
    content: '',
    hasContent: false,
    id: 'source',
    kind: 'folder',
    parentNodeId: null,
    reading: null,
    sequentialReadingEnabled: true,
    title: 'Source'
  };
  const first: Node = {
    ...seed,
    parentNodeId: 'source',
    reading: createReadingProfile({ state: 'active' }),
    reveal: 'Answer',
    title: 'First'
  };
  const second: Node = {
    ...seed,
    id: 'node-2',
    parentNodeId: 'source',
    reading: createReadingProfile({ state: 'locked' }),
    reveal: 'Answer',
    title: 'Second'
  };
  return createWorkspaceNodeActionsSetStateHarness({
    ...fixture,
    activeNodeId: 'node-1',
    nodeOrder: ['source', 'node-1', 'node-2'],
    nodesById: { source, 'node-1': first, 'node-2': second }
  });
}

describe('workspace application shelve action history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('undoes and redoes Shelve Topic from the workspace timeline', async () => {
    const harness = createShelveHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState, harness.getState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
    expect(nodeActions.shelveNode('node-1', '2026-05-01T00:00:00.000Z')).toBe(true);
    await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toHaveLength(1));
    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(historyActions.undoWorkspaceAction()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull());
    expect(historyActions.redoWorkspaceAction()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.shelvedAt).not.toBeNull());

    expect(nodeActions.unshelveNode('node-1', '2026-05-02T00:00:00.000Z')).toBe(true);
    await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack.at(-1))
      .toMatchObject({ title: 'Unshelve Topic' }));
    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull();
    expect(historyActions.undoWorkspaceAction()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.shelvedAt).not.toBeNull());
    expect(harness.getState().appActionHistory.redoStack).toHaveLength(1);

    expect(nodeActions.unshelveNode('node-1', '2026-05-03T00:00:00.000Z')).toBe(true);
    await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull());
    expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  });

  it('restores sequential reading changes with Shelve Topic', async () => {
    const harness = createSequentialHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState, harness.getState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);

    expect(nodeActions.shelveNode('node-1', '2026-05-01T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading?.state).toBe('active');
    expect(harness.getState().nodesById['node-2']?.reading?.state).toBe('active');

    await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toHaveLength(1));
    expect(historyActions.undoWorkspaceAction()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull());
    expect(harness.getState().nodesById['node-2']?.reading?.state).toBe('locked');
  });


});

it('keeps the daily post-Queue Soon stage when another reading topic is unshelved', async () => {
  const harness = createShelveHarness();
  const node = harness.getState().nodesById['node-1']!;
  harness.setState({ nodesById: { ...harness.getState().nodesById,
    waiting: { ...node, id: 'waiting' }, returned: { ...node, id: 'returned', shelvedAt: '2026-04-01T00:00:00.000Z' } },
  nodeOrder: ['node-1', 'waiting', 'returned'], reviewSessionMode: 'reading-only',
  reviewSession: { ...createStartedReviewSession({ currentNodeId: 'node-1', continueNodeId: null,
    queueNodeIds: [], sessionStartedAt: '2026-05-01T00:00:00.000Z', totalNodeCount: 2 }),
  readTopicCount: 2, soonNodeIds: ['waiting'], daily: { scope: 'test-library', dayKey: '2026-05-01', revision: 1 } } });
  const actions = createWorkspaceNodeActions(harness.setState, harness.getState);
  expect(actions.unshelveNode('returned', '2026-05-01T00:01:00.000Z')).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.pendingAction).toBeNull());
  expect(harness.getState().reviewSession.currentNodeId).toBe('node-1');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(harness.getState().reviewSession.soonNodeIds).toEqual(['waiting']);
  expect(harness.getState().reviewSession.readTopicCount).toBe(2);
});
