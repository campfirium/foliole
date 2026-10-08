import { beforeEach, expect, it, vi } from 'vitest';

import { FRAMED_SYNC_LIMITS } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import type { NativeCompanionFramedSyncTransferReceipt } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

const mocks = vi.hoisted(() => ({ entry: vi.fn(), single: vi.fn(), batch: vi.fn() }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (db: object) => unknown) => task({}) })
}));
vi.mock('./companionFramedSyncInventory', () => ({ readCompanionFramedSyncInventoryEntry: mocks.entry }));
vi.mock('./companionFramedSyncTransfer', () => ({ sendCompanionFramedSyncObject: mocks.single }));
vi.mock('./companionFramedSyncTransferBatch', () => ({ sendCompanionFramedSyncObjects: mocks.batch }));

import { createCompanionFramedSyncDifferenceBatchDelivery } from './companionFramedSyncDifferenceBatchDelivery.js';
import { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';

const args = {
  endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop',
  receiver_library_epoch: 'epoch', sync_group_id: 'group'
};
const entry = (id: string, state = '1') => ({
  global_id: id, object_type: 'node', frontier_fact_ids: [`version-${id}`],
  required_relation_ids: [], resource_hashes: ['2'.repeat(64)], review_fact_ids: [], state_fact_ids: [],
  shared_state_hash: state.repeat(64)
});
const receipt: NativeCompanionFramedSyncTransferReceipt = {
  transfer_id: 'a'.repeat(64), content_id: 'b'.repeat(64), applied_state_hash: 'c'.repeat(64),
  receiver_device_id: args.receiver_device_id, receiver_library_epoch: args.receiver_library_epoch
};
const committed = (object_id: string) => ({ kind: 'committed', object_id, object_type: 'node', receipt });
const deferred = (object_id: string) => ({ kind: 'deferred', object_id, object_type: 'node',
  error: 'framed_sync_node_parent_missing:parent' });

function setup(ids = ['child', 'parent']) {
  const differences = compareFramedSyncInventories({ local: ids.map(id => decodeCompanionInventoryEntry(entry(id))), remote: [] });
  const sent: Array<{ objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }> = [];
  const deliver = createCompanionFramedSyncDifferenceBatchDelivery(args, differences, sent);
  return { differences, sent, deliver };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.entry.mockImplementation(async (_db, value) => entry(value.globalId));
  mocks.single.mockResolvedValue(receipt);
  mocks.batch.mockImplementation(async value => value.transfers.map((selected: { object_id: string }) => committed(selected.object_id)));
});

it('sends two current units once and reuses only their committed outcomes', async () => {
  const { differences, sent, deliver } = setup();
  await expect(deliver(differences[0]!)).resolves.toBe('delivered');
  await expect(deliver(differences[1]!)).resolves.toBe('delivered');
  expect(mocks.batch).toHaveBeenCalledOnce();
  expect(mocks.single).not.toHaveBeenCalled();
  expect(sent.map(item => item.objectId)).toEqual(['child', 'parent']);
  expect(mocks.entry).toHaveBeenCalledTimes(2);
});

it('maps a deferred child and committed neighbor through the original dependency helper', async () => {
  const { differences, sent, deliver } = setup();
  mocks.batch.mockResolvedValueOnce([deferred('child'), committed('parent')]);
  await expect(deliverFramedSyncDifferencesInDependencyOrder(differences, deliver)).resolves.toEqual([]);
  expect(sent.map(item => item.objectId)).toEqual(['parent', 'child']);
  expect(mocks.batch).toHaveBeenCalledOnce();
  expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'child' }));
});

it('reselects a future deferred neighbor at its formal callback', async () => {
  const { differences, sent, deliver } = setup();
  mocks.batch.mockResolvedValueOnce([committed('child'), deferred('parent')]);
  await deliver(differences[0]!);
  await expect(deliver(differences[1]!)).resolves.toBe('delivered');
  expect(mocks.entry.mock.calls.map(([, value]) => value.globalId)).toEqual(['child', 'parent', 'parent']);
  expect(sent.map(item => item.objectId)).toEqual(['child', 'parent']);
  expect(mocks.single).toHaveBeenCalledOnce();
});

it('does not send a future deferred source that changed before its callback', async () => {
  const { differences, sent, deliver } = setup();
  mocks.batch.mockResolvedValueOnce([committed('child'), deferred('parent')]);
  await deliver(differences[0]!);
  mocks.entry.mockResolvedValue(entry('parent', '3'));
  await expect(deliver(differences[1]!)).resolves.toBe('deferred');
  expect(mocks.single).not.toHaveBeenCalled();
  expect(sent.map(item => item.objectId)).toEqual(['child']);
});

it('skips a changed requested source while still delivering its current neighbor', async () => {
  const { differences, sent, deliver } = setup();
  mocks.entry.mockImplementation(async (_db, value) => entry(value.globalId, value.globalId === 'child' ? '3' : '1'));
  await expect(deliver(differences[0]!)).resolves.toBe('deferred');
  expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'parent' }));
  expect(sent.map(item => item.objectId)).toEqual(['parent']);
});

it('sends an immediately available singleton tail without scheduling a wait', async () => {
  const { differences, deliver } = setup(['tail']);
  const timeout = vi.spyOn(globalThis, 'setTimeout');
  try {
    await expect(deliver(differences[0]!)).resolves.toBe('delivered');
    expect(mocks.single).toHaveBeenCalledOnce();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  } finally { timeout.mockRestore(); }
});

it('splits selection metadata before the control-message limit', async () => {
  const { differences } = setup();
  const large = 'r'.repeat(Math.floor(FRAMED_SYNC_LIMITS.maxControlMessageBytes * 0.6));
  const selected = differences.map(difference => ({ ...difference, need: {
    ...difference.need, requiredRelationIds: [large]
  } }));
  const send = createCompanionFramedSyncDifferenceBatchDelivery(args, selected, []);
  await expect(send(selected[0]!)).resolves.toBe('delivered');
  expect(mocks.single).toHaveBeenCalledOnce();
  expect(mocks.batch).not.toHaveBeenCalled();
});

it('caps a lookahead at 128 units and sends the remaining tail on its callback', async () => {
  const { differences, deliver } = setup(Array.from({ length: 129 }, (_, index) => `node-${String(index).padStart(3, '0')}`));
  await deliver(differences[0]!);
  expect(mocks.batch.mock.calls[0]![0].transfers).toHaveLength(128);
  expect(mocks.entry).toHaveBeenCalledTimes(128);
  await expect(deliver(differences[128]!)).resolves.toBe('delivered');
  expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ objectId: differences[128]!.globalId }));
  expect(mocks.batch).toHaveBeenCalledOnce();
});
