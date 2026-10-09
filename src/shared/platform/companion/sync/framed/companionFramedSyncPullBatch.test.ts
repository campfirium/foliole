import { beforeEach, expect, it, vi } from 'vitest';

import { FRAMED_SYNC_LIMITS } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import type { NativeCompanionFramedSyncPullBatchResult, NativeCompanionFramedSyncTransferReceipt }
  from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

const mocks = vi.hoisted(() => ({ single: vi.fn(), batch: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { pullFramedSyncObject: mocks.single, pullFramedSyncObjects: mocks.batch }
}));

import { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';
import { createCompanionFramedSyncPullBatchDelivery } from './companionFramedSyncPullBatch.js';

const args = { endpoint_url: 'http://desktop:43110', receiver_device_id: 'remote',
  receiver_library_epoch: 'remote-epoch', sync_group_id: 'group' };
const roundId = new Uint8Array(16).fill(8);
const entry = (id: string, facts = [`version-${id}`]) => ({
  global_id: id, object_type: 'node', frontier_fact_ids: facts, required_relation_ids: [],
  resource_hashes: ['2'.repeat(64)], review_fact_ids: [], state_fact_ids: [], shared_state_hash: '1'.repeat(64)
});
const receipt = (id = 'a'): NativeCompanionFramedSyncTransferReceipt => ({
  transfer_id: id.length === 64 ? id : id.repeat(64), content_id: 'b'.repeat(64), applied_state_hash: 'c'.repeat(64),
  receiver_device_id: 'local', receiver_library_epoch: 'local-epoch'
});
const outcome = (id: string, transfer = 'a') => ({ object_id: id, object_type: 'node', receipt: receipt(transfer) });
function setup(ids = ['child', 'parent'], facts?: string[]) {
  const differences = compareFramedSyncInventories({ local: [],
    remote: ids.map(id => decodeCompanionInventoryEntry(entry(id, facts))) });
  const received = new Map<string, { objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }>();
  return { differences, received, deliver: createCompanionFramedSyncPullBatchDelivery(args, differences, roundId, received) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.single.mockResolvedValue(receipt('f'));
  mocks.batch.mockImplementation(async value => ({ received: value.requests.map(
    (selected: { object_id: string }, index: number) => outcome(selected.object_id, index.toString(16).padStart(2, '0').repeat(32))) }));
});

it('pulls two requests once and caches only confirmed returned requests', async () => {
  const { differences, received, deliver } = setup();
  await expect(deliver(differences[0]!)).resolves.toBe('delivered');
  await expect(deliver(differences[1]!)).resolves.toBe('delivered');
  expect(mocks.batch).toHaveBeenCalledOnce();
  expect(mocks.single).not.toHaveBeenCalled();
  expect([...received.values()].map(item => item.objectId)).toEqual(['child', 'parent']);
  expect(mocks.batch).toHaveBeenCalledWith(expect.objectContaining({
    ...args, round_id: '08'.repeat(16), requests: [expect.objectContaining({ object_id: 'child' }),
      expect.objectContaining({ object_id: 'parent' })]
  }));
});

it('retries an unreturned suffix through the original single request', async () => {
  const { differences, received, deliver } = setup();
  mocks.batch.mockResolvedValueOnce({ received: [outcome('child')] });
  await deliver(differences[0]!);
  expect([...received.values()].map(item => item.objectId)).toEqual(['child']);
  await deliver(differences[1]!);
  expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ object_id: 'parent' }));
  expect([...received.values()].map(item => item.objectId)).toEqual(['child', 'parent']);
});

it.each(['', 'Failed to pull framed Sync objects: '])(
  'keeps the missing-parent retry and stable suffix through %s', async prefix => {
  const { differences, received, deliver } = setup(['child', 'parent', 'stable']);
  mocks.batch.mockRejectedValueOnce(new Error(`${prefix}framed_sync_node_parent_missing:parent`));
  mocks.single.mockRejectedValueOnce(new Error(prefix
    ? 'Failed to pull framed Sync object: framed_sync_node_parent_missing:parent'
    : 'framed_sync_node_parent_missing:parent'));
  mocks.batch.mockResolvedValueOnce({ received: [outcome('parent', 'd'), outcome('stable', 'e')] });
  await expect(deliverFramedSyncDifferencesInDependencyOrder(differences, deliver)).resolves.toEqual([]);
  expect([...received.values()].map(item => item.objectId)).toEqual(['parent', 'stable', 'child']);
  expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ object_id: 'child' }));
});

it('attributes a later batch dependency failure to its own request while the current object completes', async () => {
  const { differences, received, deliver } = setup(['child', 'parent']);
  mocks.batch.mockRejectedValueOnce(new Error('framed_sync_node_parent_missing:other-parent'));
  await expect(deliver(differences[0]!)).resolves.toBe('delivered');
  expect([...received.values()].map(item => item.objectId)).toEqual(['child']);
  expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ object_id: 'child' }));
  await expect(deliver(differences[1]!)).resolves.toBe('delivered');
  expect(mocks.single).toHaveBeenLastCalledWith(expect.objectContaining({ object_id: 'parent' }));
});

it.each(['framed_sync_frame_body_truncated', 'framed_sync_receipt_ack_mismatch', 'framed_sync_http_401'])(
  'keeps %s fatal without retrying a single request', async (error) => {
  const { differences, deliver } = setup();
  mocks.batch.mockRejectedValueOnce(new Error(error));
  await expect(deliver(differences[0]!)).rejects.toThrow(error);
  expect(mocks.single).not.toHaveBeenCalled();
  });

it('bounds a stable prefix to 128 requests and flushes its last request immediately', async () => {
  const { differences, deliver } = setup(Array.from({ length: 129 }, (_, i) => `node-${String(i).padStart(3, '0')}`));
  await deliver(differences[0]!);
  expect(mocks.batch.mock.calls[0]![0].requests).toHaveLength(128);
  await deliver(differences[128]!);
  expect(mocks.single).toHaveBeenCalledOnce();
});

it('bounds encoded request metadata and rejects an individually oversized request before IPC', async () => {
  const factBytes = FRAMED_SYNC_LIMITS.maxProtocolStringBytes - 16;
  const facts = Array.from({ length: 7 }, (_, i) => `${i}-${'v'.repeat(factBytes)}`);
  const bounded = setup(['node-a', 'node-b'], facts);
  await bounded.deliver(bounded.differences[0]!);
  expect(mocks.single).toHaveBeenCalledOnce();
  expect(mocks.batch).not.toHaveBeenCalled();
  const oversized = setup(['node-a'], Array.from({ length: 13 }, (_, i) => `${i}-${'v'.repeat(factBytes)}`));
  await expect(oversized.deliver(oversized.differences[0]!)).rejects.toThrow('framed_sync_batch_request_limit_exceeded');
  expect(mocks.single).toHaveBeenCalledOnce();
});

const invalid: Array<[string, NativeCompanionFramedSyncPullBatchResult, string]> = [
  ['empty', { received: [] }, 'framed_sync_batch_result_count_invalid'],
  ['extra', { received: [outcome('child'), outcome('parent', 'd'), outcome('extra', 'e')] }, 'framed_sync_batch_result_count_invalid'],
  ['reordered', { received: [outcome('parent'), outcome('child', 'd')] }, 'framed_sync_batch_result_identity_invalid'],
  ['duplicate object', { received: [outcome('child'), outcome('child', 'd')] }, 'framed_sync_batch_result_identity_invalid'],
  ['duplicate transfer', { received: [outcome('child'), outcome('parent')] }, 'framed_sync_batch_duplicate_transfer'],
  ['later malformed digest', { received: [outcome('child'), { ...outcome('parent', 'd'),
    receipt: { ...receipt('d'), content_id: 'bad' } }] }, 'framed_sync_transfer_receipt_invalid'],
  ['later mismatched receiver', { received: [outcome('child'), { ...outcome('parent', 'd'),
    receipt: { ...receipt('d'), receiver_device_id: 'other' } }] }, 'framed_sync_transfer_receipt_invalid'],
  ['later mismatched epoch', { received: [outcome('child'), { ...outcome('parent', 'd'),
    receipt: { ...receipt('d'), receiver_library_epoch: 'other' } }] }, 'framed_sync_transfer_receipt_invalid'],
  ['later missing receiver', { received: [outcome('child'), { ...outcome('parent', 'd'),
    receipt: { ...receipt('d'), receiver_device_id: '' } }] }, 'framed_sync_transfer_receipt_invalid']
];
it.each(invalid)('rejects %s before caching any returned request', async (_name, result, error) => {
  const { differences, received, deliver } = setup();
  mocks.batch.mockResolvedValueOnce(result);
  await expect(deliver(differences[0]!)).rejects.toThrow(error);
  expect(received.size).toBe(0);
  mocks.batch.mockResolvedValueOnce({ received: [outcome('child')] });
  await deliver(differences[0]!);
  expect(mocks.batch).toHaveBeenCalledTimes(2);
});

it('rejects a truthy non-string receiver in a later receipt before caching', async () => {
  const { differences, received, deliver } = setup();
  mocks.batch.mockResolvedValueOnce({ received: [outcome('child'), { ...outcome('parent', 'd'),
    receipt: { ...receipt('d'), receiver_device_id: {} } }] });
  await expect(deliver(differences[0]!)).rejects.toThrow('framed_sync_transfer_receipt_invalid');
  expect(received.size).toBe(0);
});
