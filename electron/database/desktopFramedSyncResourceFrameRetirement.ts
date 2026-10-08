import { createHash } from 'node:crypto';

import { framedSyncBytes, readFramedSyncRow, sameFramedSyncBytes }
  from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { InboundFrameInput } from '../../lib/core/sync/framedSyncStagingContract.js';

/** The fsynced resource file and its exact chunk metadata own the bytes before this call. */
export async function retireDesktopFramedSyncResourceFrame(input: {
  db: DbPort;
  frame: InboundFrameInput;
  chunk: Readonly<{ data: Uint8Array; offset: bigint; sha256: Uint8Array }>;
}) {
  if (input.frame.frameType !== 4) throw new Error('framed_sync_resource_frame_required');
  const { chunk, frame } = input;
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();
  return input.db.transaction(async (tx) => {
    const stored = await readFramedSyncRow(tx, `SELECT chunk.byte_length, chunk.chunk_sha256
      FROM framed_sync_resource_blob_chunks chunk JOIN framed_sync_blob_offers offer
        USING (transfer_id, attempt_id, sha256)
      WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? AND byte_offset = ?
        AND offer.role NOT IN (1, 5)`,
    [frame.transferId, frame.attemptId, chunk.sha256, chunk.offset]);
    if (!stored || BigInt(String(stored.byte_length)) !== BigInt(chunk.data.byteLength) ||
        !sameFramedSyncBytes(framedSyncBytes(stored, 'chunk_sha256'), hash(chunk.data))) {
      throw new Error('framed_sync_resource_frame_owner_missing');
    }
    const result = await tx.run(`UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ?
      WHERE transfer_id = ? AND attempt_id = ? AND sequence = ? AND frame_type = 4
        AND preamble = ? AND frame_header = ? AND ciphertext = ?`,
    [hash(frame.authenticatedPlaintext), frame.transferId, frame.attemptId,
      frame.sequence.toString(), frame.preamble, frame.frameHeader, hash(frame.ciphertext)]);
    if (result.changes !== 1) throw new Error('framed_sync_resource_frame_identity_conflict');
  });
}
