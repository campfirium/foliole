import type { DbPort } from './dbPort.js';

export interface SyncPackPushAckCleanupOptions {
  incomingAlias?: string;
  sourcePeerId: string;
  toStateSeq: number;
}

export async function clearConfirmedSyncPushAcksWithDbPort(
  port: DbPort,
  options: SyncPackPushAckCleanupOptions
) {
  const alias = options.incomingAlias ?? 'inc';
  const sourcePeerId = options.sourcePeerId;
  await port.run(
    `UPDATE sync_delivery_receipts SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP ` +
    `WHERE authorization_id = ? AND stream_name = 'state' AND status = 'accepted' AND EXISTS (` +
    `SELECT 1 FROM ${alias}.sync_object_state incoming ` +
    `WHERE incoming.object_type = sync_delivery_receipts.object_type ` +
    `AND incoming.object_id = sync_delivery_receipts.object_id ` +
    `AND incoming.state_seq >= CAST(sync_delivery_receipts.remote_position AS INTEGER))`,
    [sourcePeerId]
  );
  await port.run(
    `UPDATE sync_object_state SET sync_dirty = 0 WHERE sync_dirty = 1 ` +
    `AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt ` +
    `WHERE receipt.object_type = sync_object_state.object_type ` +
    `AND receipt.object_id = sync_object_state.object_id ` +
    `AND receipt.payload_identity = sync_object_state.content_hash ` +
    `AND receipt.status <> 'confirmed')`
  );
}
