import { describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncReadingProgressToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function expectNoWorkspacePersist(invoke: ReturnType<typeof vi.fn>) {
  const invokedCommands = invoke.mock.calls.map((call) => call[0]);
  expect(invokedCommands).not.toContain('save_workspace_state');
}

describe('workspaceRuntimeSync persistence mutations', () => {
  it('syncs soft delete mutations through soft_delete_nodes command', async () => {
    const invoke = vi.fn().mockResolvedValue({ deletedNodeIds: ['node-1', 'node-2'] });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await expect(syncSoftDeleteNodesToRuntime({
      nodeIds: ['node-1', 'node-2'],
      deletedAt: '2026-03-06T00:00:00.000Z'
    })).resolves.toEqual({ deletedNodeIds: ['node-1', 'node-2'] });

    expect(invoke).toHaveBeenCalledWith('soft_delete_nodes', {
      nodeIds: ['node-1', 'node-2'],
      deletedAt: '2026-03-06T00:00:00.000Z'
    });
    expectNoWorkspacePersist(invoke);
  });

  it('syncs restore mutations through restore_nodes command', async () => {
    const invoke = vi.fn().mockResolvedValue({ restoredNodeIds: ['node-1'], skippedConflicts: [] });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await expect(syncRestoreNodesToRuntime({ nodeIds: ['node-1'] })).resolves.toEqual({
      restoredNodeIds: ['node-1'],
      skippedConflicts: []
    });

    expect(invoke).toHaveBeenCalledWith('restore_nodes', { nodeIds: ['node-1'] });
    expectNoWorkspacePersist(invoke);
  });

  it('does not synthesize a restore success result without runtime confirmation', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    await expect(syncRestoreNodesToRuntime({ nodeIds: ['node-1'] })).resolves.toBeUndefined();
  });

  it('does not synthesize a restore success result after runtime failure', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('restore failed'));
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await expect(syncRestoreNodesToRuntime({ nodeIds: ['node-1'] })).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('restore_nodes', { nodeIds: ['node-1'] });
  });

  it('syncs permanent delete mutations through delete_nodes_permanently command', async () => {
    const invoke = vi.fn().mockResolvedValue({ nodeOrder: ['node-1', 'node-2'], removedNodeIds: ['node-3'] });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await expect(syncDeleteNodesPermanentlyToRuntime({
      nodeIds: ['node-3'],
      nodeOrder: ['node-1', 'node-2']
    })).resolves.toEqual({ nodeOrder: ['node-1', 'node-2'], removedNodeIds: ['node-3'] });

    expect(invoke).toHaveBeenCalledWith('delete_nodes_permanently', {
      nodeIds: ['node-3'],
      nodeOrder: ['node-1', 'node-2']
    });
    expectNoWorkspacePersist(invoke);
  });
});

describe('workspaceRuntimeSync reading persistence mutations', () => {
  it('syncs reading progress through save_reading_progress command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncReadingProgressToRuntime({
      activeNodeId: 'node-2',
      nodeViewStates: [{ nodeId: 'node-2', scrollTop: 120, selectionFrom: 4, selectionTo: 8 }],
      source: 'user-scroll',
      updatedAt: '2026-03-06T00:00:00.000Z'
    });

    expect(invoke).toHaveBeenCalledWith('save_reading_progress', {
      activeNodeId: 'node-2',
      nodeViewStates: [{ nodeId: 'node-2', scrollTop: 120, selectionFrom: 4, selectionTo: 8 }],
      source: 'user-scroll',
      updatedAt: '2026-03-06T00:00:00.000Z'
    });
    expectNoWorkspacePersist(invoke);
  });
});
