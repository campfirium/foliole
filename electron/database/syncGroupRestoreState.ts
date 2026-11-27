import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { SYNC_GROUP_OVERWRITE_PROGRESS_KEY } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { SyncGroupDevicePayload } from '../../lib/platform/syncGroupContract.js';
import {
  compareSyncGroupRestoreEvents,
  parseSyncGroupRestoreEvent,
  syncGroupRestorePeersReady,
  type SyncGroupRestoreState
} from '../../lib/platform/syncGroupRestoreContract.js';
import { isMobileSyncPlatform } from '../../lib/platform/syncSchedulingPlatform.js';

export { syncGroupRestorePeersReady };

/**
 * Nothing can fetch a library from a phone, so a restore published by one never arrives and would block
 * this device forever. Settle it so ordinary sync merges instead. A half received overwrite stays
 * pending because the local library is incomplete then.
 */
export function settleUnreceivableDesktopSyncGroupRestore(
  driver: DatabaseDriver, local: SyncGroupRestoreState | null, peerDevices: SyncGroupDevicePayload[], now: string
) {
  if (!local || local.applied || driver.queryOne(
    'SELECT 1 AS value FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_OVERWRITE_PROGRESS_KEY])) return local;
  const source = driver.queryOne<{ platform: string }>(
    'SELECT platform FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?',
    [local.event.group_id, local.event.source_device_identity_key])
    // A computer that only heard of the restore through another one has not merged the phone yet.
    ?? peerDevices.find((device) => device.device_identity_key === local.event.source_device_identity_key);
  if (!source || !isMobileSyncPlatform(source.platform)) return local;
  driver.execute('UPDATE sync_group_restore_events SET applied_at = ? WHERE restore_id = ? AND applied_at IS NULL',
    [now, local.event.restore_id]);
  return { event: local.event, applied: true };
}

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
