import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { loadFramedSyncPublishedManifest } from './framedSyncPublishedManifest.js';
import { loadVerifiedBodyRef, readBodyRange } from './verifiedBody.js';

/** A native sender reads only protected bytes of its exact frozen publication. */
export function readFramedSyncPublishedBodyRange(db: DbPort, context: FramedSyncContext, input: {
  transferId: string; hash: string; offset: number; maxBytes: number;
}) {
  return db.transaction(async (tx) => {
    if (!/^[a-f0-9]{64}$/u.test(input.hash) || !Number.isSafeInteger(input.offset) || input.offset < 0 ||
        !Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > BODY_CONTENT_CHUNK_BYTES) {
      throw new Error('body_range_invalid');
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
    const ref = await loadVerifiedBodyRef(tx, input.hash);
    if (!ref || BigInt(ref.byteLength) !== descriptor.byteLength) {
      throw new Error('framed_sync_published_body_unavailable');
    }
    return readBodyRange(tx, ref, input.offset, input.maxBytes);
  });
}
