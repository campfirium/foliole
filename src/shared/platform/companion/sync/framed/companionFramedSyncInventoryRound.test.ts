vi.mock('./companionFramedSyncResourceRound', () => ({
  runCompanionFramedSyncResourceRound: vi.fn(async () => ({ pending: 0, scanned: 0, transferred: 0, unavailable: 0 }))
}));

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./companionFramedSyncPeerRoutes', () => ({
  rememberCompanionFramedSyncPeerRoute: vi.fn(async () => undefined)
}));

vi.mock('./companionFramedSyncPendingPublications', () => ({
  resumeCompanionFramedSyncPendingPublications: vi.fn(async () => 0)
}));

const mocks = vi.hoisted(() => ({
  batch: vi.fn(), pullBatch: vi.fn(), localEntry: vi.fn(), localInventory: vi.fn(), pull: vi.fn(), remoteInventory: vi.fn(), send: vi.fn()
}));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    pullFramedSyncObject: mocks.pull, pullFramedSyncObjects: mocks.pullBatch, readFramedSyncInventory: mocks.remoteInventory
  }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (db: object) => unknown) => task({ query: async () => [] }) })
}));
vi.mock('./companionFramedSyncInventory', () => ({
  readCompanionFramedSyncInventory: mocks.localInventory,
  readCompanionFramedSyncInventoryEntry: mocks.localEntry
}));
vi.mock('./companionFramedSyncTransfer', () => ({
  sendCompanionFramedSyncObject: mocks.send
}));
vi.mock('./companionFramedSyncTransferBatch', () => ({ sendCompanionFramedSyncObjects: mocks.batch }));

import { sendCompanionFramedSyncInventoryDifferences } from './companionFramedSyncInventoryRound.js';
import { resumeCompanionFramedSyncPendingPublications } from './companionFramedSyncPendingPublications.js';
import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound.js';

const request = {
  endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop-1',
  receiver_library_epoch: 'desktop-epoch', sync_group_id: 'group-1'
};
const pullReceipt = (transfer_id = 'b'.repeat(64)) => ({ transfer_id, content_id: 'd'.repeat(64),
  applied_state_hash: 'e'.repeat(64), receiver_device_id: 'local', receiver_library_epoch: 'local-epoch' });
const entry = (id: string, state = '1', relations: string[] = []) => ({
  frontier_fact_ids: [`version-${id}`], global_id: id, object_type: 'node',
  required_relation_ids: relations, resource_hashes: ['2'.repeat(64)], review_fact_ids: [], state_fact_ids: [],
  shared_state_hash: state.repeat(64)
});

// Transport stubs leave inventory unchanged, so committed receipts alone cannot prove convergence.
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runCompanionFramedSyncResourceRound).mockResolvedValue({ pending: 0, scanned: 0, transferred: 0, unavailable: 0 });
  mocks.remoteInventory.mockResolvedValue({ entries: [], round_id: '8'.repeat(32) });
  mocks.localInventory.mockResolvedValue({ entries: [entry('node-a'), entry('node-b')] });
  mocks.localEntry.mockImplementation(async (_db, key: { globalId: string }) =>
    key.globalId === 'node-a' ? entry('node-a') : entry('node-b', '3'));
  mocks.send.mockResolvedValue({ transfer_id: 'a'.repeat(64) });
  mocks.pull.mockResolvedValue(pullReceipt());
  mocks.pullBatch.mockImplementation(async (value) => {
    const selected = value.requests[0];
    return { received: [{ object_id: selected.object_id, object_type: selected.object_type,
      receipt: await mocks.pull({ ...value, ...selected }) }] };
  });
});


it('revalidates each selected current node before invoking the native sender', async () => {
  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'node-b', objectType: 'node' }, { globalId: 'node-a', objectType: 'node' }],
    received: [],
    sent: [{ objectId: 'node-a', receipt: { transfer_id: 'a'.repeat(64) } }]
  });
  expect(mocks.remoteInventory).toHaveBeenCalledWith(request);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send).toHaveBeenCalledWith({
    endpointUrl: request.endpoint_url, groupId: request.sync_group_id,
    includeCurrentNode: true, objectId: 'node-a', objectType: 'node',
    receiverDeviceId: request.receiver_device_id,
    receiverLibraryEpoch: request.receiver_library_epoch,
    requiredRelationIds: [], reviewFactIds: [], stateFactIds: []
  });
});

it('rejects malformed remote inventory before selecting objects', async () => {
  mocks.remoteInventory.mockResolvedValue({
    entries: [{ ...entry('remote'), shared_state_hash: 'bad' }], round_id: '8'.repeat(32)
  });
  await expect(sendCompanionFramedSyncInventoryDifferences(request))
    .rejects.toThrow('framed_sync_inventory_shared_state_hash_invalid');
  expect(mocks.send).not.toHaveBeenCalled();
});

it('rejects legacy non-node inventory identities', async () => {
  mocks.remoteInventory.mockResolvedValue({ entries: [{
    ...entry('remote'), object_type: 'node_review'
  }], round_id: '8'.repeat(32) });
  await expect(sendCompanionFramedSyncInventoryDifferences(request))
    .rejects.toThrow('framed_sync_inventory_identity_invalid');
  expect(mocks.send).not.toHaveBeenCalled();
});

it('sends exact relation ids without redundantly including the current node', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [entry('node-c', '1', ['relation-1'])] });
  mocks.remoteInventory.mockResolvedValue({ entries: [entry('node-c')], round_id: '8'.repeat(32) });
  mocks.localEntry.mockResolvedValue(entry('node-c', '1', ['relation-1']));
  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'node-c', objectType: 'node' }],
    received: [],
    sent: [{ objectId: 'node-c', receipt: { transfer_id: 'a'.repeat(64) } }]
  });
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    includeCurrentNode: false, objectId: 'node-c', objectType: 'node', requiredRelationIds: ['relation-1'],
    reviewFactIds: [], stateFactIds: []
  }));
});

it('pulls a remote-only Node with the same inventory round identity', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [] });
  mocks.remoteInventory.mockResolvedValue({
    entries: [entry('remote-node')], round_id: '8'.repeat(32)
  });

  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'remote-node', objectType: 'node' }], received: [{
      objectId: 'remote-node', receipt: { transfer_id: 'b'.repeat(64) }
    }], sent: []
  });
  expect(mocks.pull).toHaveBeenCalledWith({
    ...request,
    frontier_fact_ids: ['version-remote-node'],
    object_id: 'remote-node', object_type: 'node',
    required_relation_ids: [],
    resource_hashes: ['2'.repeat(64)],
    review_fact_ids: [], state_fact_ids: [],
    round_id: '8'.repeat(32)
  });
});

it('pulls a missing parent before retrying a child that arrived first', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [] });
  mocks.remoteInventory.mockResolvedValue({
    entries: [entry('child'), entry('parent')], round_id: '8'.repeat(32)
  });
  let parentReceived = false;
  mocks.pull.mockImplementation(async ({ object_id: objectId }: { object_id: string }) => {
    if (objectId === 'child' && !parentReceived) {
      throw new Error('Failed to pull framed Sync object. Cause: framed_sync_node_parent_missing:parent');
    }
    if (objectId === 'parent') parentReceived = true;
    return pullReceipt(objectId === 'parent' ? 'c'.repeat(64) : 'b'.repeat(64));
  });

  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'child', objectType: 'node' }, { globalId: 'parent', objectType: 'node' }], received: [
      { objectId: 'parent', receipt: { transfer_id: 'c'.repeat(64) } },
      { objectId: 'child', receipt: { transfer_id: 'b'.repeat(64) } }
    ], sent: []
  });
  expect(mocks.pull.mock.calls.map(([value]) => value.object_id))
    .toEqual(['child', 'child', 'parent', 'child']);
});

it('defers a source changed during publication and continues the inventory round', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [] });
  mocks.remoteInventory.mockResolvedValue({
    entries: [entry('changed'), entry('stable')], round_id: '8'.repeat(32)
  });
  mocks.pull.mockImplementation(async ({ object_id: objectId }: { object_id: string }) => {
    if (objectId === 'changed') {
      throw new Error('framed_sync_http_400:framed_sync_difference_request_source_changed');
    }
    return pullReceipt();
  });

  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'changed', objectType: 'node' }, { globalId: 'stable', objectType: 'node' }],
    received: [{ objectId: 'stable', receipt: { transfer_id: 'b'.repeat(64) } }],
    sent: []
  });
});

it('defers a child when its missing parent changed during publication', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [] });
  mocks.remoteInventory.mockResolvedValue({
    entries: [entry('child'), entry('parent'), entry('stable')], round_id: '8'.repeat(32)
  });
  mocks.pull.mockImplementation(async ({ object_id: objectId }: { object_id: string }) => {
    if (objectId === 'child') {
      throw new Error('framed_sync_http_400:framed_sync_node_parent_missing:parent');
    }
    if (objectId === 'parent') {
      throw new Error('framed_sync_http_400:framed_sync_source_changed');
    }
    return pullReceipt();
  });

  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [
      { globalId: 'parent', objectType: 'node' },
      { globalId: 'child', objectType: 'node' },
      { globalId: 'stable', objectType: 'node' }
    ],
    received: [{ objectId: 'stable', receipt: { transfer_id: 'b'.repeat(64) } }],
    sent: []
  });
  expect(mocks.pull.mock.calls.map(([value]) => value.object_id))
    .toEqual(['child', 'child', 'parent', 'stable']);
});

it('pulls a divergent Node before revalidating and deferring its stale outbound side', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [entry('node-a', '1')] });
  mocks.remoteInventory.mockResolvedValue({
    entries: [entry('node-a', '5')], round_id: '8'.repeat(32)
  });
  mocks.localEntry.mockResolvedValue(entry('node-a', '5'));

  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'node-a', objectType: 'node' }],
    received: [{ objectId: 'node-a', receipt: { transfer_id: 'b'.repeat(64) } }],
    sent: []
  });
  expect(mocks.pull).toHaveBeenCalledOnce();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.pull.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.localEntry.mock.invocationCallOrder[0]!
  );
});

it('defers a body-missing local Node without failing the rest of the round', async () => {
  const missing = { ...entry('node-a'), resource_hashes: [] };
  mocks.localInventory.mockResolvedValue({ entries: [missing] });
  mocks.localEntry.mockResolvedValue(missing);

  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toMatchObject({
    deferredObjects: [{ globalId: 'node-a', objectType: 'node' }], received: [], sent: []
  });
  expect(mocks.send).not.toHaveBeenCalled();
});

it('replays pending publications before revalidating the selected source', async () => {
  await sendCompanionFramedSyncInventoryDifferences(request);
  expect(mocks.localInventory).toHaveBeenCalledWith(expect.anything());
  expect(mocks.localEntry).toHaveBeenCalledWith(expect.anything(),
    expect.objectContaining({ globalId: 'node-a' }));
  expect(resumeCompanionFramedSyncPendingPublications).toHaveBeenCalledWith(request, []);
  expect(mocks.send).toHaveBeenCalledOnce();
});
