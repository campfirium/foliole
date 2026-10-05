import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  localEntry: vi.fn(), localInventory: vi.fn(), remoteInventory: vi.fn(), send: vi.fn()
}));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { readFramedSyncInventory: mocks.remoteInventory }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (db: object) => unknown) => task({}) })
}));
vi.mock('./companionFramedSyncInventory', () => ({
  readCompanionFramedSyncInventory: mocks.localInventory,
  readCompanionFramedSyncInventoryEntry: mocks.localEntry
}));
vi.mock('./companionFramedSyncTransfer', () => ({
  sendCompanionFramedSyncObject: mocks.send
}));

import { sendCompanionFramedSyncInventoryDifferences } from './companionFramedSyncInventoryRound.js';

const request = {
  endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop-1',
  receiver_library_epoch: 'desktop-epoch', sync_group_id: 'group-1'
};
const entry = (id: string, state = '1', relations: string[] = []) => ({
  frontier_fact_ids: [`version-${id}`], global_id: id, object_type: 'node',
  required_relation_ids: relations, resource_hashes: ['2'.repeat(64)], review_fact_ids: [],
  shared_state_hash: state.repeat(64)
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.remoteInventory.mockResolvedValue({ entries: [] });
  mocks.localInventory.mockResolvedValue({ entries: [entry('node-a'), entry('node-b')] });
  mocks.localEntry.mockImplementation(async (_db, key: { globalId: string }) =>
    key.globalId === 'node-a' ? entry('node-a') : entry('node-b', '3'));
  mocks.send.mockResolvedValue({ transfer_id: 'a'.repeat(64) });
});

it('revalidates each selected current node before invoking the native sender', async () => {
  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toEqual({
    deferredObjects: [{ globalId: 'node-b', objectType: 'node' }],
    sent: [{ objectId: 'node-a', receipt: { transfer_id: 'a'.repeat(64) } }]
  });
  expect(mocks.remoteInventory).toHaveBeenCalledWith(request);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send).toHaveBeenCalledWith({
    endpointUrl: request.endpoint_url, groupId: request.sync_group_id,
    includeCurrentNode: true, objectId: 'node-a',
    receiverDeviceId: request.receiver_device_id,
    receiverLibraryEpoch: request.receiver_library_epoch,
    requiredRelationIds: [], reviewFactIds: []
  });
});

it('rejects malformed remote inventory before selecting objects', async () => {
  mocks.remoteInventory.mockResolvedValue({ entries: [{ ...entry('remote'), shared_state_hash: 'bad' }] });
  await expect(sendCompanionFramedSyncInventoryDifferences(request))
    .rejects.toThrow('framed_sync_inventory_shared_state_hash_invalid');
  expect(mocks.send).not.toHaveBeenCalled();
});

it('rejects legacy non-node inventory identities', async () => {
  mocks.remoteInventory.mockResolvedValue({ entries: [{
    ...entry('remote'), object_type: 'node_review'
  }] });
  await expect(sendCompanionFramedSyncInventoryDifferences(request))
    .rejects.toThrow('framed_sync_inventory_identity_invalid');
  expect(mocks.send).not.toHaveBeenCalled();
});

it('sends exact relation ids without redundantly including the current node', async () => {
  mocks.localInventory.mockResolvedValue({ entries: [entry('node-c', '1', ['relation-1'])] });
  mocks.remoteInventory.mockResolvedValue({ entries: [entry('node-c')] });
  mocks.localEntry.mockResolvedValue(entry('node-c', '1', ['relation-1']));
  await expect(sendCompanionFramedSyncInventoryDifferences(request)).resolves.toEqual({
    deferredObjects: [],
    sent: [{ objectId: 'node-c', receipt: { transfer_id: 'a'.repeat(64) } }]
  });
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    includeCurrentNode: false, objectId: 'node-c', requiredRelationIds: ['relation-1'],
    reviewFactIds: []
  }));
});
