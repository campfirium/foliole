import { beforeEach, expect, it, vi } from 'vitest';

import { FRAMED_SYNC_BATCH_LIMITS } from '../../../../../../lib/core/sync/framedSyncBatchLimits.js';
import type {
  NativeCompanionFramedSyncTransferBatchOutcome,
  NativeCompanionFramedSyncTransferBatchRequest
} from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

const native = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { sendFramedSyncTransfers: native.send }
}));

import { sendCompanionFramedSyncObjects } from './companionFramedSyncTransferBatch.js';

function request(): NativeCompanionFramedSyncTransferBatchRequest {
  return {
    endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop-1',
    receiver_library_epoch: 'desktop-epoch-1', sync_group_id: 'group-1',
    transfers: ['node-1', 'node-2'].map(object_id => ({
      include_current_node: true, object_id, object_type: 'node',
      required_relation_ids: ['relation-1'], review_fact_ids: [], state_fact_ids: []
    }))
  };
}

function outcomes(): NativeCompanionFramedSyncTransferBatchOutcome[] {
  return request().transfers.map((selected, index) => ({
    kind: 'committed', object_id: selected.object_id, object_type: selected.object_type,
    receipt: {
      applied_state_hash: 'a'.repeat(64), content_id: 'b'.repeat(64),
      receiver_device_id: 'desktop-1', receiver_library_epoch: 'desktop-epoch-1',
      transfer_id: String(index + 1).repeat(64)
    }
  }));
}

beforeEach(() => native.send.mockReset());

it('maps independent receipts to the original ordered object selections in one native call', async () => {
  const args = request();
  const result = outcomes();
  native.send.mockResolvedValueOnce({ outcomes: result });
  await expect(sendCompanionFramedSyncObjects(args)).resolves.toEqual(result);
  expect(native.send).toHaveBeenCalledExactlyOnceWith(args);
});

it.each([0, FRAMED_SYNC_BATCH_LIMITS.maxItems + 1])('rejects %s selections before invoking native', async count => {
  const args = request();
  args.transfers = Array.from({ length: count }, () => args.transfers[0]!);
  await expect(sendCompanionFramedSyncObjects(args)).rejects.toThrow('framed_sync_batch_item_limit_exceeded');
  expect(native.send).not.toHaveBeenCalled();
});

it('accepts exactly the maximum selection count without adding nested peer parameters', async () => {
  const args = request();
  args.transfers = Array.from({ length: FRAMED_SYNC_BATCH_LIMITS.maxItems }, (_, index) => ({
    ...request().transfers[0]!, object_id: `node-${index}`
  }));
  const result = args.transfers.map(selected => ({ kind: 'deferred' as const,
    object_id: selected.object_id, object_type: selected.object_type, error: 'framed_sync_dependency_missing' }));
  native.send.mockResolvedValueOnce({ outcomes: result });
  await expect(sendCompanionFramedSyncObjects(args)).resolves.toEqual(result);
  expect(native.send).toHaveBeenCalledExactlyOnceWith(args);
  expect(args.transfers[0]).not.toHaveProperty('receiver_device_id');
});

it.each([1, 3])('rejects a result containing %s receipts for two selected objects', async count => {
  const result = outcomes();
  native.send.mockResolvedValueOnce({ outcomes: Array.from({ length: count }, (_, i) => result[i % 2]) });
  await expect(sendCompanionFramedSyncObjects(request())).rejects.toThrow('framed_sync_batch_result_count_invalid');
});

it.each(['object_id', 'object_type'] as const)('rejects a receipt mapped to another %s', async field => {
  const result = outcomes();
  result[1] = { ...result[1]!, [field]: 'another-object' };
  native.send.mockResolvedValueOnce({ outcomes: result });
  await expect(sendCompanionFramedSyncObjects(request())).rejects.toThrow('framed_sync_batch_result_identity_invalid');
});

it.each(['receiver_device_id', 'receiver_library_epoch', 'transfer_id', 'content_id', 'applied_state_hash'] as const)(
  'rejects a receipt with an invalid %s', async field => {
    const result = outcomes();
    const selected = result[1]!;
    if (selected.kind !== 'committed') throw new Error('test_receipt_missing');
    result[1] = { ...selected, receipt: { ...selected.receipt, [field]: 'invalid' } };
    native.send.mockResolvedValueOnce({ outcomes: result });
    await expect(sendCompanionFramedSyncObjects(request())).rejects.toThrow('framed_sync_transfer_receipt_invalid');
  });

it('rejects duplicate transfer identities even when object identities differ', async () => {
  const result = outcomes();
  const first = result[0]!;
  const second = result[1]!;
  if (first.kind !== 'committed' || second.kind !== 'committed') throw new Error('test_receipt_missing');
  result[1] = { ...second, receipt: { ...second.receipt, transfer_id: first.receipt.transfer_id } };
  native.send.mockResolvedValueOnce({ outcomes: result });
  await expect(sendCompanionFramedSyncObjects(request())).rejects.toThrow('framed_sync_batch_duplicate_transfer');
});

it.each(['', 'x'.repeat(4097)])('rejects empty or oversized deferred error text', async error => {
  const result = outcomes();
  result[1] = { kind: 'deferred', object_id: 'node-2', object_type: 'node', error };
  native.send.mockResolvedValueOnce({ outcomes: result });
  await expect(sendCompanionFramedSyncObjects(request())).rejects.toThrow('framed_sync_batch_result_error_invalid');
});

it('preserves independent committed and bounded deferred outcomes', async () => {
  const result = outcomes();
  result[1] = { kind: 'deferred', object_id: 'node-2', object_type: 'node', error: 'x'.repeat(4096) };
  native.send.mockResolvedValueOnce({ outcomes: result });
  await expect(sendCompanionFramedSyncObjects(request())).resolves.toEqual(result);
});

it('propagates native failure without another send or fallback', async () => {
  const failure = new Error('framed_sync_http_503');
  native.send.mockRejectedValueOnce(failure);
  await expect(sendCompanionFramedSyncObjects(request())).rejects.toBe(failure);
  expect(native.send).toHaveBeenCalledTimes(1);
});

it('rejects an unknown outcome kind even with a bounded error', async () => {
  const result = outcomes();
  native.send.mockResolvedValueOnce({ outcomes: [result[0], {
    kind: 'unknown', object_id: 'node-2', object_type: 'node', error: 'bounded'
  }] });
  await expect(sendCompanionFramedSyncObjects(request())).rejects.toThrow('framed_sync_batch_result_error_invalid');
});

it('requires an explicitly selected transfer identity to match the committed receipt', async () => {
  const args = request();
  args.transfers = args.transfers.map(selected => ({ ...selected, transfer_id: 'f'.repeat(64) }));
  native.send.mockResolvedValueOnce({ outcomes: outcomes() });
  await expect(sendCompanionFramedSyncObjects(args)).rejects.toThrow('framed_sync_batch_result_identity_invalid');
});
