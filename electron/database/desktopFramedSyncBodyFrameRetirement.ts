import { createHash } from 'node:crypto';

import { readFramedSyncRow } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { InboundFrameInput } from '../../lib/core/sync/framedSyncStagingContract.js';

/** The exact durable body chunk replaces the authenticated frame's duplicate plaintext. */
export async function retireDesktopFramedSyncBodyFrame(input: {
  db: DbPort; frame: InboundFrameInput;
  chunk: Readonly<{ data: Uint8Array; offset: bigint; sha256: Uint8Array }>;
}) {
  const { chunk, frame } = input;
  if (frame.frameType !== 4) throw new Error('framed_sync_body_frame_required');
  const stored = await readFramedSyncRow(input.db, `SELECT 1 AS present
    FROM framed_sync_blob_chunks chunk JOIN framed_sync_blob_offers offer
      USING (transfer_id, attempt_id, sha256)
    WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? AND byte_offset = ?
      AND offer.role IN (1, 5) AND chunk.data = ?`,
  [frame.transferId, frame.attemptId, chunk.sha256, chunk.offset, chunk.data]);
  if (!stored) throw new Error('framed_sync_body_frame_owner_missing');
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();
  const result = await input.db.run(`UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ?
    WHERE transfer_id = ? AND attempt_id = ? AND sequence = ? AND frame_type = 4
      AND preamble = ? AND frame_header = ? AND ciphertext = ?`,
  [hash(frame.authenticatedPlaintext), frame.transferId, frame.attemptId, frame.sequence.toString(),
    frame.preamble, frame.frameHeader, hash(frame.ciphertext)]);
  if (result.changes !== 1) throw new Error('framed_sync_body_frame_identity_conflict');
}
