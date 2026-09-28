import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { markSyncGroupRestoreApplied } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';

export async function applyDesktopRestorePage<T extends { toStateSeq: number }>(args: {
  after: number;
  apply: (port: DbPort) => Promise<T>;
  frontierStateSeq: number;
  groupId: string;
  peerId: string;
  port: DbPort;
  restoreId: string;
}) {
  return args.port.transaction(async (tx) => {
    const removedNodeIds = args.after === 0
      ? await clearWorkgroupSyncDataForRestore(tx, args.restoreId) : [];
    const result = await args.apply(tx);
    const [event] = await tx.query<{
      group_id: string; restore_id: string; restored_at: string; source_device_identity_key: string
    }>(`SELECT group_id, restore_id, restored_at, source_device_identity_key
      FROM sync_group_restore_events WHERE group_id = ? AND restore_id = ? AND applied_at IS NULL`,
    [args.groupId, args.restoreId]);
    if (!event) throw new Error('sync_group_restore_superseded');
    if (result.toStateSeq === args.frontierStateSeq) await markSyncGroupRestoreApplied(tx, event);
    await tx.run(`INSERT INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at)
      VALUES (?, 'state', ?, ?) ON CONFLICT(peer_id, stream_name) DO UPDATE SET
      cursor_value = excluded.cursor_value, updated_at = excluded.updated_at`,
    [args.peerId, String(result.toStateSeq), new Date().toISOString()]);
    return { result, removedNodeIds };
  });
}
