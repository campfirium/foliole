import { openDatabaseConnection } from './connection.js';
import { loadDesktopSyncGroup } from './syncGroupStore.js';

export function updateLocalSyncGroupDeviceName(deviceName: string, now = new Date().toISOString()) {
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const local = group.members.find((member) => member.device_id === group.local_device_id);
  if (!local || local.device_name === deviceName) return group;
  openDatabaseConnection().driver.execute(
    `UPDATE sync_group_members SET device_name = ?, updated_at = ?
     WHERE group_id = ? AND device_id = ? AND state = 'active'`,
    [deviceName, now, group.group_id, group.local_device_id]
  );
  return loadDesktopSyncGroup();
}
