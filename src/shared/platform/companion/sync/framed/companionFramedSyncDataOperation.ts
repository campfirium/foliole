import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../../../../../lib/core/sync/framedSyncCompletedPublication.js';
import { createFramedSyncFileOutboundStaging } from '../../../../../../lib/core/sync/framedSyncFileOutbound.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { createFramedSyncOutboundReceiptStaging } from '../../../../../../lib/core/sync/framedSyncOutboundReceiptStaging.js';
import { parseCanonicalAttachmentStorageKey } from '../../../../../../lib/platform/attachmentResource.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { applyCompanionFramedSyncFileTransfers } from './companionFramedSyncFileApply.js';

export { readCompanionFramedSyncInventory } from './companionFramedSyncInventory.js';

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function requiredDigest(value: unknown) {
  const text = requiredText(value);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error('sync_group_data_digest_required');
  return hexToBytes(text);
}

function stagingKind(value: unknown) {
  if (value !== 'android' && value !== 'ios') throw new Error('framed_sync_staging_kind_invalid');
  return value;
}

function resourceStorageKeys(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('framed_sync_resource_storage_keys_invalid');
  return value.map((entry) => {
    if (typeof entry !== 'string' || !parseCanonicalAttachmentStorageKey(entry)) {
      throw new Error('framed_sync_resource_storage_keys_invalid');
    }
    return entry;
  });
}

export async function applyCompanionFramedSyncDataOperation(
  db: DbPort,
  payload: Record<string, unknown>,
  files?: FramedSyncFilePort
) {
  const identity = {
    receiverDeviceId: requiredText(payload.receiver_device_id),
    receiverLibraryEpoch: requiredText(payload.receiver_library_epoch),
    senderDeviceId: requiredText(payload.sender_device_id),
    senderLibraryEpoch: requiredText(payload.sender_library_epoch),
    transferId: requiredDigest(payload.transfer_id)
  };
  if (payload.staging_format === 'files' && !files) throw new Error('framed_sync_file_owner_unavailable');
  if (files && payload.staging_format !== 'files') throw new Error('framed_sync_file_staging_required');
  const receipt = files ? (await applyCompanionFramedSyncFileTransfers(db, files, [identity]))[0]! : await applyCompanionFramedSyncTransfer(db, {
    ...identity,
    stagingKind: stagingKind(payload.staging_kind),
    stagingPath: requiredText(payload.staging_path),
    resourceStorageKeys: resourceStorageKeys(payload.resource_storage_keys)
  });
  return {
    applied_state_hash: bytesToHex(receipt.appliedStateHash),
    content_id: bytesToHex(receipt.contentId),
    receiver_device_id: receipt.receiverDeviceId,
    receiver_library_epoch: receipt.receiverLibraryEpoch,
    transfer_id: bytesToHex(receipt.transferId)
  };
}

export async function completeCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>,
  files?: FramedSyncFilePort
) {
  const receipt = {
    appliedStateHash: requiredDigest(payload.applied_state_hash),
    contentId: requiredDigest(payload.content_id),
    receiverDeviceId: requiredText(payload.receiver_device_id),
    receiverLibraryEpoch: requiredText(payload.receiver_library_epoch),
    transferId: requiredDigest(payload.transfer_id)
  };
  const staging = files ? createFramedSyncFileOutboundStaging(files) : createFramedSyncOutboundReceiptStaging(db);
  const state = await staging.commitOutboundReceipt(receipt);
  await staging.releaseOutboundHolds(receipt.transferId);
  if (!files) await retireFramedSyncCompletedPublication(db, receipt.transferId);
  return { receipt_state: state, transfer_id: bytesToHex(receipt.transferId) };
}
