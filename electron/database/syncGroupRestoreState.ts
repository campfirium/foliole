import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  compareSyncGroupRestoreEvents,
  parseSyncGroupRestoreEvent,
  syncGroupRestorePeersReady,
  type SyncGroupRestoreState
} from '../../lib/platform/syncGroupRestoreContract.js';

export { syncGroupRestorePeersReady };

interface RestoreRow {
  [key: string]: unknown;
  applied_at: string | null;
  group_id: string;
  restore_id: string;
  restored_at: string;
  source_device_identity_key: string;
}

export function loadDesktopSyncGroupRestoreState(driver: DatabaseDriver, groupId: string) {
  const row = driver.queryOne<RestoreRow>(`SELECT group_id, restore_id, restored_at,
    source_device_identity_key, applied_at FROM sync_group_restore_events
    WHERE group_id = ? ORDER BY restored_at DESC, restore_id DESC LIMIT 1`, [groupId]);
  return row ? { event: parseSyncGroupRestoreEvent(row), applied: row.applied_at !== null } : null;
}

export function receiveDesktopSyncGroupRestoreState(
  driver: DatabaseDriver, groupId: string, incoming: SyncGroupRestoreState | null
) {
  const current = loadDesktopSyncGroupRestoreState(driver, groupId);
  if (!incoming) return current;
  const event = parseSyncGroupRestoreEvent(incoming.event);
  if (event.group_id !== groupId) throw new Error('sync_group_restore_group_mismatch');
  if (current && compareSyncGroupRestoreEvents(current.event, event) >= 0) return current;
  driver.execute(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)`, [event.restore_id, event.group_id, event.restored_at,
    event.source_device_identity_key, new Date().toISOString()]);
  return { event, applied: false };
}
