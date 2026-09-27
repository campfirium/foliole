import { openDatabaseConnection } from './connection.js';

export function loadPendingDesktopSyncGroupRemovalDeviceIds(groupId: string) {
  return openDatabaseConnection().driver.queryAll<{ target_device_identity_key: string }>(
    `SELECT target_device_identity_key FROM sync_group_removal_decisions
     WHERE group_id = ? AND completed_at IS NULL AND superseded_at IS NULL`, [groupId]
  ).map((row) => row.target_device_identity_key);
}
