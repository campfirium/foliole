import { readFramedSyncRow } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import { markFramedSyncCompletion } from './framedSyncCompletionRetention.js';

/** Only transport payloads retire; business content and other recipient owners survive. */
export function retireFramedSyncCompletedPublication(db: DbPort, transferId: Uint8Array) {
  return db.transaction(async (tx) => {
    const row = await readFramedSyncRow(tx,
      'SELECT state FROM framed_sync_outbound_publications WHERE transfer_id = ?', [transferId]);
    if (!row || row.state !== 'receipt_committed') return;
    if (await readFramedSyncRow(tx,
      'SELECT 1 AS present FROM framed_sync_outbound_holds WHERE transfer_id = ?', [transferId])) return;
    await markFramedSyncCompletion(tx, transferId);
    await tx.run(`UPDATE framed_sync_outbound_publications
      SET canonical_manifest = ?, manifest_json = ? WHERE transfer_id = ?`,
    [new Uint8Array(), '{"blobs":[],"facts":[]}', transferId]);
    await tx.run('DELETE FROM framed_sync_outbound_fact_refs WHERE transfer_id = ?', [transferId]);
    await tx.run('DELETE FROM framed_sync_outbound_blob_refs WHERE transfer_id = ?', [transferId]);
    await tx.run("DELETE FROM framed_sync_outbound_attempts WHERE transfer_id = ? AND purpose = 'transfer'",
      [transferId]);
  });
}
