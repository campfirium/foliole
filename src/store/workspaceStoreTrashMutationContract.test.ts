import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRelearnNodeToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  return { actions: createWorkspaceNodeActions(harness.setState), harness };
}

describe('workspace trash mutation commit boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not apply soft delete patch when runtime fails', async () => {
    const { actions, harness } = createHarness();
    const nodeId = (await actions.createRootNode('root 2'))!;
    vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue(undefined);

    await actions.deleteNode(nodeId);

    expect(harness.getState().nodesById[nodeId]?.deletedAt).toBeUndefined();
    expect(harness.getState().trashedNodeIds).not.toContain(nodeId);
  });

  it('removes a soft-deleted current review node only after runtime success', async () => {
    const { actions, harness } = createHarness();
    const nodeId = (await actions.createRootNode('root 2'))!;
    harness.setState((state) => ({
      reviewSession: {
        ...state.reviewSession,
        currentNodeId: nodeId,
        queueNodeIds: [nodeId, 'node-1']
      }
    }));
    vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementation(async (payload) => ({ deletedNodeIds: payload.nodeIds }));

    await actions.deleteNode(nodeId);

    expect(harness.getState().reviewSession.currentNodeId).toBe('node-1');
    expect(harness.getState().reviewSession.queueNodeIds).not.toContain(nodeId);
  });

  it('keeps restore patch gated by runtime success', async () => {
    const { actions, harness } = createHarness();
    const nodeId = (await actions.createRootNode('root 2'))!;
    vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementation(async (payload) => ({ deletedNodeIds: payload.nodeIds }));
    await actions.deleteNode(nodeId);
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue(undefined);

    await actions.restoreNode(nodeId);

    expect(harness.getState().trashedNodeIds).toContain(nodeId);
  });
});
