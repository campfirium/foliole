import { sha256 } from '@noble/hashes/sha2.js';

import { framedSyncBytes, readFramedSyncRow } from '../database/framedSyncStagingSerialization.js';

import type { DbPort, DbRow } from './dbPort.js';

export const FRAMED_SYNC_READY_COPY_RETIREMENT = [
  "DELETE FROM framed_sync_inbound_facts WHERE transfer_id IN (SELECT transfer_id FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply')",
  "DELETE FROM framed_sync_blob_chunks WHERE transfer_id IN (SELECT transfer_id FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply')",
  "UPDATE framed_sync_inbound_transfers SET canonical_manifest = manifest_hash WHERE state = 'ready_to_apply' AND canonical_manifest IS NOT NULL"
] as const;

export const FRAMED_SYNC_READY_BLOB_FRAMES = `SELECT frame.rowid AS frame_row, authenticated_plaintext
  FROM framed_sync_inbound_frames frame JOIN framed_sync_inbound_transfers inbound USING (transfer_id)
  WHERE inbound.state = 'ready_to_apply' AND frame_type = 4 AND length(authenticated_plaintext) != 32`;

/** Fact Protobuf and available bodies remain the only recoverable content after full verification. */
export async function retireFramedSyncReadyPayloads(db: DbPort, transferId: Uint8Array) {
  const row = await readFramedSyncRow(db,
    'SELECT state FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [transferId]);
  if (row?.state !== 'ready_to_apply') throw new Error('framed_sync_cleanup_requires_ready_input');
  for (const table of ['framed_sync_inbound_facts', 'framed_sync_blob_chunks']) {
    await db.run(`DELETE FROM ${table} WHERE transfer_id = ?`, [transferId]);
  }
  let after = 0;
  for (;;) {
    const [frame] = await db.query<DbRow>(`SELECT rowid AS frame_row, authenticated_plaintext
      FROM framed_sync_inbound_frames WHERE transfer_id = ? AND frame_type = 4
        AND rowid > ? AND length(authenticated_plaintext) != 32 ORDER BY rowid LIMIT 1`,
    [transferId, after]);
    if (!frame) return;
    if (typeof frame.frame_row !== 'number') throw new Error('framed_sync_cleanup_frame_invalid');
    await db.run('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ? WHERE rowid = ?',
      [sha256(framedSyncBytes(frame, 'authenticated_plaintext')), frame.frame_row]);
    after = frame.frame_row;
  }
}
