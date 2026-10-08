import { FRAMED_SYNC_BATCH_LIMITS } from '../../../../../../lib/core/sync/framedSyncBatchLimits.js';
import type { NativeCompanionFramedSyncTransferBatchRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

import { assertCompanionFramedSyncReceipt } from './companionFramedSyncTransfer.js';

/** Native preparation owns byte packing; this boundary carries only original selection metadata. */
export async function sendCompanionFramedSyncObjects(args: NativeCompanionFramedSyncTransferBatchRequest) {
  if (!args.transfers.length || args.transfers.length > FRAMED_SYNC_BATCH_LIMITS.maxItems) {
    throw new Error('framed_sync_batch_item_limit_exceeded');
  }
  const result = await FolioleCompanionSync.sendFramedSyncTransfers(args);
  if (result.outcomes.length !== args.transfers.length) throw new Error('framed_sync_batch_result_count_invalid');
  const receipts = new Set<string>();
  for (const [index, outcome] of result.outcomes.entries()) {
    const selected = args.transfers[index];
    if (!selected || outcome.object_id !== selected.object_id || outcome.object_type !== selected.object_type) {
      throw new Error('framed_sync_batch_result_identity_invalid');
    }
    if (outcome.kind === 'committed') {
      assertCompanionFramedSyncReceipt({ receiverDeviceId: args.receiver_device_id,
        receiverLibraryEpoch: args.receiver_library_epoch }, outcome.receipt);
      if (selected.transfer_id && selected.transfer_id !== outcome.receipt.transfer_id) {
        throw new Error('framed_sync_batch_result_identity_invalid');
      }
      if (receipts.has(outcome.receipt.transfer_id)) throw new Error('framed_sync_batch_duplicate_transfer');
      receipts.add(outcome.receipt.transfer_id);
    } else if (outcome.kind !== 'deferred' || !outcome.error || outcome.error.length > 4096) {
      throw new Error('framed_sync_batch_result_error_invalid');
    }
  }
  return result.outcomes;
}
