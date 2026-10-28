import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  syncDeleteNodesPermanentlyToRuntime: vi.fn(async (payload: { nodeIds: string[] }) => ({
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

  it('syncs permanent delete with IDs alone through runtime bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = (await actions.createRootNode('root 2'))!;

    vi.clearAllMocks();
    await actions.deleteNodePermanently(nodeId);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId]
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
      nodeIds: expect.arrayContaining([parentNodeId, childNodeId])
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
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId])
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

it('removes an image item without sending a complete parent snapshot', async () => {
  vi.clearAllMocks();
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1']!.imageRegions = [{ attachmentId: 'image', regions: [
    { id: 'gone', x: 0, y: 0, width: 0.5, height: 0.5 }
  ] }];
  fixture.nodesById.child = { ...fixture.nodesById['node-1']!, id: 'child', parentNodeId: 'node-1',
    kind: 'item', imageRegions: null, anchorLink: { id: 'gone', kind: 'cloze', locator: {
      attachmentId: 'image', x: 0, y: 0, width: 0.5, height: 0.5
    } } };
  fixture.nodeOrder.push('child');
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState);
  await actions.deleteNodePermanently('child');
  expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({ nodeIds: ['child'] });
  expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
  expect(harness.getState().nodesById['node-1']?.imageRegions).toBeNull();
  expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
  expect(harness.getState().nodesById.child).toBeUndefined();
});
