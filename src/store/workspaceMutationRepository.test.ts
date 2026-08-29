import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserLocalWorkspaceMutationRepository,
  getWorkspaceMutationRepository,
  installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository
} from './workspaceMutationRepository';
import {
  syncDeleteNodesPermanentlyToRuntime,
  syncMoveNodesToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(async () => null),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

const deletedAt = '2026-06-17T00:00:00.000Z';
const nodeIds = ['node-1'];
const nodeOrder = ['node-2'];
const movedNodeOrder = ['node-2', 'node-1'];
const moveNodesPayload = {
  nodeOrder: movedNodeOrder,
  nodes: [{
    nodeId: 'node-1',
    parentNodeId: 'node-2',
    reading: null,
    sequentialReadingEnabled: null,
    updatedAt: deletedAt
  }]
};

describe('workspace mutation repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceMutationRepository();
  });

  afterEach(() => {
    resetWorkspaceMutationRepository();
  });

  it('delegates default trash and move mutations to runtime sync', async () => {
    mockRuntimeMutationResults();

    const repository = getWorkspaceMutationRepository();

    await expectRepositoryAcks(repository);
  });

  it('returns local ACKs for browser-local commit-on-result mutations', async () => {
    installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
    const repository = getWorkspaceMutationRepository();

    await expectRepositoryAcks(repository);

    expect(syncSoftDeleteNodesToRuntime).not.toHaveBeenCalled();
    expect(syncRestoreNodesToRuntime).not.toHaveBeenCalled();
    expect(syncDeleteNodesPermanentlyToRuntime).not.toHaveBeenCalled();
    expect(syncMoveNodesToRuntime).not.toHaveBeenCalled();
  });
});

function mockRuntimeMutationResults() {
  vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: nodeIds });
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: nodeIds, skippedConflicts: [] });
  vi.mocked(syncDeleteNodesPermanentlyToRuntime).mockResolvedValue({ nodeOrder, removedNodeIds: nodeIds });
  vi.mocked(syncMoveNodesToRuntime).mockResolvedValue({ movedNodeIds: nodeIds, nodeOrder: movedNodeOrder });
}

async function expectRepositoryAcks(repository: ReturnType<typeof getWorkspaceMutationRepository>) {
  await expect(Promise.resolve(repository.syncSoftDeleteNodes({ deletedAt, nodeIds }))).resolves.toEqual({
    deletedNodeIds: nodeIds
  });
  await expect(Promise.resolve(repository.syncRestoreNodes({ nodeIds }))).resolves.toEqual({
    restoredNodeIds: nodeIds,
    skippedConflicts: []
  });
  await expect(Promise.resolve(repository.syncDeleteNodesPermanently({ nodeIds, nodeOrder }))).resolves.toEqual({
    nodeOrder,
    removedNodeIds: nodeIds
  });
  await expect(Promise.resolve(repository.syncMoveNodes(moveNodesPayload))).resolves.toEqual({
    movedNodeIds: nodeIds,
    nodeOrder: movedNodeOrder
  });
}
