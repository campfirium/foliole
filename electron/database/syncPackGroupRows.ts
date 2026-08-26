import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

export interface SyncPackGroupRow extends DatabaseRow {
  created_at: string;
  display_name: string;
  group_id: string;
}

export interface SyncPackGroupDeviceRow extends DatabaseRow {
  canonical_library_path: string;
  device_anchor: string;
  device_identity_key: string;
  device_name: string;
  group_id: string;
  joined_at: string;
  last_seen_at: string | null;
  left_at: string | null;
  platform: string;
  state: 'active' | 'left';
  updated_at: string;
}

export function loadSyncPackGroupRows(driver: DatabaseDriver) {
  const groups = driver.queryAll<SyncPackGroupRow>(
    `SELECT group_id, display_name, created_at FROM sync_groups WHERE group_id IN (
       SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1
     )`
  );
  const groupId = groups[0]?.group_id;
  const devices = groups.length === 0 ? [] : driver.queryAll<SyncPackGroupDeviceRow>(
    `SELECT group_id, device_identity_key, device_anchor, canonical_library_path,
            device_name, platform, state, joined_at, left_at, last_seen_at, updated_at
     FROM sync_group_devices WHERE group_id = ? AND state IN ('active', 'left')
     ORDER BY joined_at, device_identity_key`,
    [groupId!]
  );
  return { devices, groups };
}
