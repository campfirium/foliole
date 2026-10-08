import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { loadFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import { loadFramedSyncPublishedManifest } from './framedSyncPublishedManifest.js';

/** A single complete body belongs to this exact publication and receiver hold. */
export function readFramedSyncPublishedBody(db: DbPort, context: FramedSyncContext, input: {
  transferId: string; hash: string; byteLength: number;
}) {
  return db.transaction(async (tx) => {
    if (!/^[a-f0-9]{64}$/u.test(input.hash) || !Number.isSafeInteger(input.byteLength) ||
        input.byteLength < 0 || input.byteLength > TEXT_BODY_MAX_BYTES) {
      throw new Error('framed_sync_body_length_invalid');
    }
    const { manifest } = await loadFramedSyncPublishedManifest(tx, context, input.transferId);
    const descriptor = manifest.blobs.find((blob) => bytesToHex(blob.sha256) === input.hash);
    const [held] = await tx.query(`SELECT 1 FROM framed_sync_outbound_holds hold
      JOIN framed_sync_outbound_blob_refs blob ON blob.transfer_id = hold.transfer_id
      WHERE hold.transfer_id = ? AND hold.member_id = ? AND blob.sha256 = ? AND blob.role IN (1, 5)`,
    [hexToBytes(input.transferId), context.receiverDeviceId, hexToBytes(input.hash)]);
    if (!held || !descriptor || (descriptor.role !== 1 && descriptor.role !== 5)) {
      throw new Error('framed_sync_published_body_not_held');
    }
    if (descriptor.byteLength !== BigInt(input.byteLength)) throw new Error('framed_sync_body_length_invalid');
    const bytes = await loadFramedSyncFrozenBody(tx, descriptor);
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return bytes;
  });
}
