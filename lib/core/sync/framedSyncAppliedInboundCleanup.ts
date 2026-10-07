import { readFramedSyncRow } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';

/** Called after business references have committed, never for receiving or ready input. */
export async function retireFramedSyncAppliedInbound(tx: DbPort, transferId: Uint8Array) {
  const row = await readFramedSyncRow(tx,
    'SELECT state FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [transferId]);
  if (row?.state !== 'applied') throw new Error('framed_sync_cleanup_requires_applied_input');
  if (await readFramedSyncRow(tx, `SELECT 1 AS present FROM framed_sync_blob_pins WHERE transfer_id = ?
    UNION ALL SELECT 1 AS present FROM framed_sync_resource_pins WHERE transfer_id = ?`, [transferId, transferId])) {
    throw new Error('framed_sync_cleanup_requires_released_pins');
  }
  await tx.run(`DELETE FROM framed_sync_available_blobs WHERE sha256 IN
    (SELECT sha256 FROM framed_sync_blob_offers WHERE transfer_id = ?) AND NOT EXISTS
    (SELECT 1 FROM framed_sync_blob_pins pin WHERE pin.sha256 = framed_sync_available_blobs.sha256)`, [transferId]);
  await tx.run(`DELETE FROM framed_sync_available_resources WHERE sha256 IN
    (SELECT sha256 FROM framed_sync_blob_offers WHERE transfer_id = ?) AND NOT EXISTS
    (SELECT 1 FROM framed_sync_resource_pins pin WHERE pin.sha256 = framed_sync_available_resources.sha256)`, [transferId]);
  await tx.run('DELETE FROM framed_sync_inbound_attempts WHERE transfer_id = ?', [transferId]);
  await tx.run(`UPDATE framed_sync_inbound_transfers SET header_json = NULL, canonical_manifest = NULL,
    manifest_json = NULL, active_attempt_id = NULL WHERE transfer_id = ?`, [transferId]);
}
