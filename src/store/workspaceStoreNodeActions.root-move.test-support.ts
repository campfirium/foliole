import { expect, it, vi } from 'vitest';

import {
  syncMoveNodesToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

export function registerRootMoveCoverage() {
  it('syncs moved root nodes through runtime command bridge', async () => {
    vi.mocked(syncMoveNodesToRuntime).mockImplementation(async (payload) => ({
      movedNodeIds: payload.nodes.map((node) => node.nodeId),
      nodeOrder: payload.nodeOrder
    }));
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstFolderId = (await actions.createRootNode('Folder A', 'folder'))!;
    const secondFolderId = (await actions.createRootNode('Folder B', 'folder'))!;

    vi.clearAllMocks();
    const moved = await actions.moveNodes([secondFolderId], firstFolderId, 'before');

    expect([moved, ...[firstFolderId, secondFolderId].map((id) => harness.getState().nodesById[id]?.parentNodeId)]).toEqual([true, null, null]);
    expect(syncMoveNodesToRuntime).toHaveBeenCalledWith(expect.objectContaining({
      nodeOrder: [...createWorkspaceNodeActionsFixture().nodeOrder, secondFolderId, firstFolderId],
      nodes: []
    }));
    expect(harness.getState().nodeOrder).toEqual([...createWorkspaceNodeActionsFixture().nodeOrder, secondFolderId, firstFolderId]);
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
  });
}
