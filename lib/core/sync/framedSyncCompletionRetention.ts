import type { DbPort, DbRow } from './dbPort.js';
import { retireFramedSyncAppliedInbound } from './framedSyncAppliedInboundCleanup.js';

export const FRAMED_SYNC_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function markFramedSyncCompletion(db: DbPort, transferId: Uint8Array, now = Date.now()) {
  await db.run('INSERT OR IGNORE INTO framed_sync_completion_windows VALUES (?, ?)', [transferId, now]);
}

/** Expiry removes transport bookkeeping; pending input and business facts are never TTL data. */
export function expireFramedSyncCompletions(db: DbPort, now = Date.now()) {
  return db.transaction(async (tx) => {
    await recoverCommittedInboundCleanup(tx);
    const rows = await tx.query<DbRow>(`SELECT completed.transfer_id FROM framed_sync_completion_windows completed
      WHERE completed.completed_at < ? AND NOT EXISTS
        (SELECT 1 FROM framed_sync_outbound_holds hold WHERE hold.transfer_id = completed.transfer_id)
      AND NOT EXISTS (SELECT 1 FROM framed_sync_outbound_publications publication
        WHERE publication.transfer_id = completed.transfer_id AND publication.state = 'published')
      AND NOT EXISTS (SELECT 1 FROM framed_sync_inbound_transfers inbound
        WHERE inbound.transfer_id = completed.transfer_id AND inbound.state != 'applied')
      AND NOT EXISTS (SELECT 1 FROM framed_sync_blob_pins pin WHERE pin.transfer_id = completed.transfer_id)
      AND NOT EXISTS (SELECT 1 FROM framed_sync_resource_pins pin WHERE pin.transfer_id = completed.transfer_id)`,
    [now - FRAMED_SYNC_RECEIPT_RETENTION_MS]);
    for (const row of rows) {
      const transferId = row.transfer_id;
      if (!(transferId instanceof Uint8Array)) throw new Error('framed_sync_completion_identity_invalid');
      await tx.run('DELETE FROM framed_sync_outbound_attempts WHERE transfer_id = ?', [transferId]);
      await tx.run('DELETE FROM framed_sync_receipts WHERE transfer_id = ?', [transferId]);
      await tx.run('DELETE FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [transferId]);
      await tx.run('DELETE FROM framed_sync_outbound_publications WHERE transfer_id = ?', [transferId]);
      await tx.run('DELETE FROM framed_sync_completion_windows WHERE transfer_id = ?', [transferId]);
    }
    return rows.length;
  });
}

async function recoverCommittedInboundCleanup(db: DbPort) {
  const applied = await db.query<DbRow>(`SELECT inbound.transfer_id FROM framed_sync_inbound_transfers inbound
    JOIN framed_sync_receipts receipt USING (transfer_id)
    WHERE inbound.state = 'applied' AND inbound.header_json IS NOT NULL
      AND inbound.content_id = receipt.content_id AND inbound.receiver_device_id = receipt.receiver_device_id
      AND inbound.receiver_library_epoch = receipt.receiver_library_epoch`);
  for (const row of applied) {
    const id = row.transfer_id;
    if (!(id instanceof Uint8Array)) throw new Error('framed_sync_completion_identity_invalid');
    await db.run('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?', [id]);
    await db.run('DELETE FROM framed_sync_resource_pins WHERE transfer_id = ?', [id]);
    await retireFramedSyncAppliedInbound(db, id);
  }
}
