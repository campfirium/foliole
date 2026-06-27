import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncRestoreNodesToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRelearnNodeToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

function createTrashedDuplicateHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-trash'] = {
    ...fixture.nodesById['node-1']!,
    id: 'node-trash',
    title: 'Trashed duplicate'
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-trash'];
  fixture.trashedNodeIds = ['node-trash'];
  fixture.trashedNodeDeletedAtById = {
    'node-trash': '2026-05-18T00:00:00.000Z'
  };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState);
  return { actions, harness };
}

describe('createRestoreNodeAction conflict handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the trashed duplicate and selects the reusable live node', async () => {
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({
      restoredNodeIds: [],
      skippedConflicts: [{ liveNodeId: 'node-1', trashNodeId: 'node-trash' }]
    });
    const { actions, harness } = createTrashedDuplicateHarness();

    const targetNodeId = await actions.restoreNode('node-trash');

    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: ['node-trash'] });
    expect(targetNodeId).toBe('node-1');
    expect(harness.getState().activeNodeId).toBe('node-1');
    expect(harness.getState().trashedNodeIds).toEqual(['node-trash']);
    expect(harness.getState().trashedNodeDeletedAtById['node-trash']).toBe('2026-05-18T00:00:00.000Z');
  });

  it('does not apply a restore patch without a runtime success result', async () => {
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue(undefined);
    const { actions, harness } = createTrashedDuplicateHarness();

    const targetNodeId = await actions.restoreNode('node-trash');

    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: ['node-trash'] });
    expect(targetNodeId).toBeNull();
    expect(harness.getState().activeNodeId).toBe('node-1');
    expect(harness.getState().trashedNodeIds).toEqual(['node-trash']);
    expect(harness.getState().trashedNodeDeletedAtById['node-trash']).toBe('2026-05-18T00:00:00.000Z');
  });
});
