import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncMoveNodesToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import {
  createBrowserLocalWorkspaceMutationRepository,
  getWorkspaceMutationRepository,
  installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository
} from './workspaceMutationRepository';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

describe('workspace mutation repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceMutationRepository();
  });

  afterEach(() => {
    resetWorkspaceMutationRepository();
  });

  it('delegates default trash and move mutations to runtime sync', async () => {
    vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: ['node-1'] });
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: ['node-1'], skippedConflicts: [] });
    vi.mocked(syncDeleteNodesPermanentlyToRuntime).mockResolvedValue({
      nodeOrder: ['node-2'],
      removedNodeIds: ['node-1']
    });
    vi.mocked(syncMoveNodesToRuntime).mockResolvedValue({
      movedNodeIds: ['node-1'],
      nodeOrder: ['node-2', 'node-1']
    });

    const repository = getWorkspaceMutationRepository();

    await expect(repository.syncSoftDeleteNodes({
      deletedAt: '2026-06-17T00:00:00.000Z',
      nodeIds: ['node-1']
    })).resolves.toEqual({ deletedNodeIds: ['node-1'] });
    await expect(repository.syncRestoreNodes({ nodeIds: ['node-1'] })).resolves.toEqual({
      restoredNodeIds: ['node-1'],
      skippedConflicts: []
    });
    await expect(repository.syncDeleteNodesPermanently({
      nodeIds: ['node-1'],
      nodeOrder: ['node-2']
    })).resolves.toEqual({ nodeOrder: ['node-2'], removedNodeIds: ['node-1'] });
    await expect(repository.syncMoveNodes({
      nodeOrder: ['node-2', 'node-1'],
      nodes: [{
        nodeId: 'node-1',
        parentNodeId: 'node-2',
        reading: null,
        sequentialReadingEnabled: null,
        updatedAt: '2026-06-17T00:00:00.000Z'
      }]
    })).resolves.toEqual({ movedNodeIds: ['node-1'], nodeOrder: ['node-2', 'node-1'] });
  });

  it('returns local ACKs for browser-local commit-on-result mutations', async () => {
    installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
    const repository = getWorkspaceMutationRepository();

    await expect(repository.syncSoftDeleteNodes({
      deletedAt: '2026-06-17T00:00:00.000Z',
      nodeIds: ['node-1']
    })).resolves.toEqual({ deletedNodeIds: ['node-1'] });
    await expect(repository.syncRestoreNodes({ nodeIds: ['node-1'] })).resolves.toEqual({
      restoredNodeIds: ['node-1'],
      skippedConflicts: []
    });
    await expect(repository.syncDeleteNodesPermanently({
      nodeIds: ['node-1'],
      nodeOrder: ['node-2']
    })).resolves.toEqual({ nodeOrder: ['node-2'], removedNodeIds: ['node-1'] });
    await expect(repository.syncMoveNodes({
      nodeOrder: ['node-2', 'node-1'],
      nodes: [{
        nodeId: 'node-1',
        parentNodeId: 'node-2',
        reading: null,
        sequentialReadingEnabled: null,
        updatedAt: '2026-06-17T00:00:00.000Z'
      }]
    })).resolves.toEqual({ movedNodeIds: ['node-1'], nodeOrder: ['node-2', 'node-1'] });

    expect(syncSoftDeleteNodesToRuntime).not.toHaveBeenCalled();
    expect(syncRestoreNodesToRuntime).not.toHaveBeenCalled();
    expect(syncDeleteNodesPermanentlyToRuntime).not.toHaveBeenCalled();
    expect(syncMoveNodesToRuntime).not.toHaveBeenCalled();
  });
});
