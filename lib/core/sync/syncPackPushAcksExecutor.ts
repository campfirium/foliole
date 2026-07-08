import type { DbPort } from './dbPort.js';

export interface SyncPackPushAckCleanupOptions {
  incomingAlias?: string;
  toStateSeq: number;
}

export async function clearConfirmedSyncPushAcksWithDbPort(
  port: DbPort,
  options: SyncPackPushAckCleanupOptions
) {
  const alias = options.incomingAlias ?? 'inc';
  await port.run(
    `UPDATE sync_object_state SET sync_dirty = 0 ` +
    `WHERE sync_dirty = 1 AND EXISTS (` +
    `SELECT 1 FROM sync_push_ack ack JOIN ${alias}.sync_object_state incoming ` +
    `ON incoming.object_type = ack.object_type AND incoming.object_id = ack.object_id ` +
    `WHERE ack.object_type = sync_object_state.object_type ` +
    `AND ack.object_id = sync_object_state.object_id ` +
    `AND ack.state_seq IS NOT NULL ` +
    `AND incoming.state_seq >= ack.state_seq ` +
    `AND incoming.content_hash = sync_object_state.content_hash)`
  );
  await port.run(
    `DELETE FROM sync_push_ack WHERE EXISTS (` +
    `SELECT 1 FROM sync_object_state state WHERE state.object_type = sync_push_ack.object_type ` +
    `AND state.object_id = sync_push_ack.object_id AND state.sync_dirty = 0)`
  );
}
