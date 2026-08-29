import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncNodeContentToRuntime,
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
  syncDeleteNodesPermanentlyToRuntime: vi.fn(async (payload: { nodeIds: string[]; nodeOrder: string[] }) => ({
    nodeOrder: payload.nodeOrder,
    removedNodeIds: payload.nodeIds
  })),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRelearnNodeToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn(async (payload: { nodeIds: string[] }) => ({ deletedNodeIds: payload.nodeIds }))
}));

describe('createWorkspaceNodeActions permanent delete sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs permanent delete command with next node order through runtime bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = (await actions.createRootNode('root 2'))!;

    vi.clearAllMocks();
    await actions.deleteNodePermanently(nodeId);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      nodeOrder: [INBOX_NODE_ID, HOME_NODE_ID, 'special-virtual-root', 'node-1']
    });
  });

  it('permanently deletes the highest trashed ancestor when a covered child is requested', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const parentNodeId = (await actions.createRootNode('Folder', 'folder'))!;
    const childNodeId = (await actions.createChildNode(parentNodeId, 'Topic'))!;

    await actions.deleteNode(parentNodeId);
    vi.clearAllMocks();
    await actions.deleteNodePermanently(childNodeId);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([parentNodeId, childNodeId]),
      nodeOrder: [HOME_NODE_ID, INBOX_NODE_ID, 'special-virtual-root', 'node-1']
    });
    expect(harness.getState().nodesById[parentNodeId]).toBeUndefined();
    expect(harness.getState().nodesById[childNodeId]).toBeUndefined();
  });

  it('syncs multi-select permanent delete through one runtime bridge command', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstNodeId = (await actions.createRootNode('root 2'))!;
    const secondNodeId = (await actions.createRootNode('root 3'))!;

    vi.clearAllMocks();
    await actions.deleteNodesPermanently([firstNodeId, secondNodeId]);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId]),
      nodeOrder: [INBOX_NODE_ID, HOME_NODE_ID, 'special-virtual-root', 'node-1']
    });
  });

  it('does not sync when deleting a missing node', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.deleteNode('missing-node');

    expect(syncSoftDeleteNodesToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
  });
});
