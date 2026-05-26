import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
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

  it('undoes and redoes Shelve Topic without changing reading state', () => {
    const harness = createShelveHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
    const beforeReading = harness.getState().nodesById['node-1']?.reading;

    expect(nodeActions.shelveNode('node-1', '2026-05-01T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading).toEqual(beforeReading);
    expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({
      nodeId: 'node-1',
      title: 'Shelve Topic',
      type: 'topic.shelve'
    });

    expect(historyActions.undoWorkspaceAction('2026-05-02T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull();
    expect(harness.getState().nodesById['node-1']?.reading).toEqual(beforeReading);

    expect(historyActions.redoWorkspaceAction('2026-05-03T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(syncNodeContentToRuntime).toHaveBeenCalled();
  });

  it('undoes and redoes sequential reading changes caused by Shelve Topic', () => {
    const harness = createSequentialHarness();
    const nodeActions = createWorkspaceNodeActions(harness.setState);
    const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);

    expect(nodeActions.shelveNode('node-1', '2026-05-01T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.reading?.state).toBe('active');
    expect(harness.getState().nodesById['node-2']?.reading?.state).toBe('active');

    expect(historyActions.undoWorkspaceAction('2026-05-02T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBeNull();
    expect(harness.getState().nodesById['node-2']?.reading?.state).toBe('locked');

    expect(historyActions.redoWorkspaceAction('2026-05-03T00:00:00.000Z')).toBe(true);
    expect(harness.getState().nodesById['node-1']?.shelvedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(harness.getState().nodesById['node-2']?.reading?.state).toBe('active');
  });
});
