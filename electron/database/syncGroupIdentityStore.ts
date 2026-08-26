import { openDatabaseConnection } from './connection.js';
import { loadDesktopSyncGroup } from './syncGroupStore.js';

export function updateLocalSyncGroupHostName(hostName: string, now = new Date().toISOString()) {
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const local = group.devices.find((device) => device.device_identity_key === group.local_device_identity_key);
  if (!local || local.device_name === hostName) return group;
  openDatabaseConnection().driver.execute(
    `UPDATE sync_group_devices SET device_name = ?, updated_at = ?
     WHERE group_id = ? AND device_identity_key = ? AND state = 'active'`,
    [hostName, now, group.group_id, group.local_device_identity_key]
  );
  return loadDesktopSyncGroup();
}
