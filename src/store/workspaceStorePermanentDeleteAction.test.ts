import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { requestWorkspaceStateRefresh } from './workspaceRefreshScheduler';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
vi.mock('./workspaceRefreshScheduler', () => ({ requestWorkspaceStateRefresh: vi.fn() }));

type Payload = { nodeId?: string; nodeIds?: string[]; nodeOrder?: string[] };

async function seedTrashedNode(permanentDelete: (payload: Payload) => Promise<unknown>) {
  const invoke = vi.fn(async (command: string, payload: Payload = {}) => {
    if (command === 'create_topic') {
      return { createdNodeIds: [payload.nodeId], nodeOrder: payload.nodeOrder, nodes: [payload] };
    }
    if (command === 'soft_delete_nodes') return { deletedNodeIds: payload.nodeIds ?? [] };
    if (command === 'delete_nodes_permanently') return permanentDelete(payload);
    return null;
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);
  const nodeId = (await actions.createRootNode('Trashed'))!;
  await actions.deleteNode(nodeId);
  expect(harness.getState().trashedNodeIds).toContain(nodeId);
  return { actions, harness, nodeId };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('removes the nodes from Trash before the runtime finishes deleting them', async () => {
  let finish!: (value: unknown) => void;
  const { actions, harness, nodeId } = await seedTrashedNode(() => new Promise((resolve) => { finish = resolve; }));

  const deletion = actions.deleteNodesPermanently([nodeId]);

  expect(harness.getState().trashedNodeIds).not.toContain(nodeId);
  expect(harness.getState().nodesById[nodeId]).toBeUndefined();
  finish({ nodeOrder: [], removedNodeIds: [nodeId] });
  await deletion;
  expect(harness.getState().nodesById[nodeId]).toBeUndefined();
  expect(showAppRuntimeNotice).not.toHaveBeenCalled();
});

it('keeps the nodes out of Trash when a refresh reloads them before the deletion commits', async () => {
  let finish!: (value: unknown) => void;
  const { actions, harness, nodeId } = await seedTrashedNode(() => new Promise((resolve) => { finish = resolve; }));
  const beforeDelete = harness.getState();

  const deletion = actions.deleteNodesPermanently([nodeId]);
  harness.setState({
    nodeOrder: beforeDelete.nodeOrder,
    nodesById: beforeDelete.nodesById,
    trashedNodeDeletedAtById: beforeDelete.trashedNodeDeletedAtById,
    trashedNodeIds: beforeDelete.trashedNodeIds
  });
  finish({ nodeOrder: [], removedNodeIds: [nodeId] });
  await deletion;

  expect(harness.getState().trashedNodeIds).not.toContain(nodeId);
  expect(harness.getState().nodesById[nodeId]).toBeUndefined();
});

it('tells the user and reloads the workspace when the runtime deletion fails', async () => {
  const { actions, nodeId } = await seedTrashedNode(async () => { throw new Error('delete failed'); });

  await actions.deleteNodesPermanently([nodeId]);
  await vi.waitFor(() => expect(requestWorkspaceStateRefresh).toHaveBeenCalledWith('content-changed'));

  expect(showAppRuntimeNotice).toHaveBeenCalledWith('Could not delete from Trash. Please try again.', 'error');
});
