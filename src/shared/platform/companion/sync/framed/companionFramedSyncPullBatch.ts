import { bytesToHex } from '@noble/hashes/utils.js';


import { FRAMED_SYNC_BATCH_LIMITS } from '../../../../../../lib/core/sync/framedSyncBatchLimits.js';
import { FRAMED_SYNC_LIMITS } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { projectFramedSyncDifferenceRequest } from '../../../../../../lib/core/sync/framedSyncDifferenceRequest.js';
import { requiredFramedSyncNodeVersionIds } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import type { FramedSyncInventoryDifference } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncMissingDependency } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import type { NativeCompanionFramedSyncInventoryRequest, NativeCompanionFramedSyncPullBatchResult,
  NativeCompanionFramedSyncTransferReceipt } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

export function createCompanionFramedSyncPullBatchDelivery(args: NativeCompanionFramedSyncInventoryRequest,
  differences: readonly FramedSyncInventoryDifference[], roundId: Uint8Array,
  received: Map<string, { objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }>) {
  const completed = new Set<FramedSyncInventoryDifference>();
  const indexes = new Map(differences.map((difference, index) => [difference, index]));
  return async (difference: FramedSyncInventoryDifference) => {
    if (completed.has(difference)) return 'delivered' as const;
    const candidates = prefix(indexes.get(difference) === undefined ? [difference] : differences.slice(indexes.get(difference)!),
      completed, roundId);
    const requests = candidates.map(selection);
    let result: NativeCompanionFramedSyncPullBatchResult;
    try {
      result = requests.length === 1 ? await pullIndividual(args, requests[0]!, roundId)
        : await FolioleCompanionSync.pullFramedSyncObjects({ ...args, requests, round_id: bytesToHex(roundId) });
    } catch (error) {
      if (requests.length === 1 || !readFramedSyncMissingDependency(error)) throw error;
      result = await pullIndividual(args, requests[0]!, roundId);
    }
    assertPrefix(result, candidates);
    for (const [index, item] of result.received.entries()) {
      completed.add(candidates[index]!);
      received.set(`${item.object_type}\0${item.object_id}`, { objectId: item.object_id, receipt: item.receipt });
    }
    return completed.has(difference) ? 'delivered' as const : 'deferred' as const;
  };
}

async function pullIndividual(args: NativeCompanionFramedSyncInventoryRequest,
  request: ReturnType<typeof selection>, roundId: Uint8Array): Promise<NativeCompanionFramedSyncPullBatchResult> {
  return { received: [{ ...request,
    receipt: await FolioleCompanionSync.pullFramedSyncObject({ ...args, ...request, round_id: bytesToHex(roundId) }) }] };
}

function prefix(differences: readonly FramedSyncInventoryDifference[], completed: ReadonlySet<FramedSyncInventoryDifference>,
  roundId: Uint8Array) {
  const requests: FramedSyncInventoryDifference[] = [];
  let bytes = 0;
  for (const difference of differences) {
    if (difference.direction !== 'remote_to_local' || requests.length === FRAMED_SYNC_BATCH_LIMITS.maxItems) break;
    if (completed.has(difference)) continue;
    const size = projectFramedSyncDifferenceRequest({ difference, roundId }).encoded.byteLength;
    if (bytes + size > FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
      if (!requests.length) throw new Error('framed_sync_batch_request_limit_exceeded');
      break;
    }
    bytes += size;
    requests.push(difference);
  }
  if (!requests.length) throw new Error('framed_sync_batch_request_missing');
  return requests;
}

function selection(difference: FramedSyncInventoryDifference) {
  return { frontier_fact_ids: difference.objectType === 'node' ? requiredFramedSyncNodeVersionIds(difference) : [], object_id: difference.globalId, object_type: difference.objectType,
    required_relation_ids: difference.need.requiredRelationIds, resource_hashes: difference.need.resourceHashes.map(bytesToHex),
    review_fact_ids: difference.need.reviewFactIds, state_fact_ids: difference.need.stateFactIds ?? [] };
}

function assertPrefix(result: NativeCompanionFramedSyncPullBatchResult, requested: readonly FramedSyncInventoryDifference[]) {
  if (!result || !Array.isArray(result.received) || !result.received.length || result.received.length > requested.length) {
    throw new Error('framed_sync_batch_result_count_invalid');
  }
  const transfers = new Set<string>();
  let receiver: string | undefined;
  for (const [index, item] of result.received.entries()) {
    const expected = requested[index]!;
    if (!item || item.object_id !== expected.globalId || item.object_type !== expected.objectType) {
      throw new Error('framed_sync_batch_result_identity_invalid');
    }
    const receipt = item.receipt;
    if (!receipt || typeof receipt.receiver_device_id !== 'string' || !receipt.receiver_device_id.trim() ||
        typeof receipt.receiver_library_epoch !== 'string' || !receipt.receiver_library_epoch.trim() ||
        ![receipt.transfer_id, receipt.content_id, receipt.applied_state_hash].every(value => /^[a-f0-9]{64}$/u.test(value))) {
      throw new Error('framed_sync_transfer_receipt_invalid');
    }
    const identity = JSON.stringify([receipt.receiver_device_id, receipt.receiver_library_epoch]);
    receiver ??= identity;
    if (receiver !== identity) throw new Error('framed_sync_transfer_receipt_invalid');
    if (transfers.has(receipt.transfer_id)) throw new Error('framed_sync_batch_duplicate_transfer');
    transfers.add(receipt.transfer_id);
  }
}
