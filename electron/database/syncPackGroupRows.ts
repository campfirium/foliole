import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

export interface SyncPackGroupRow extends DatabaseRow {
  created_at: string;
  created_by_device_id: string;
  display_name: string;
  group_id: string;
  timeline_id: string;
}

export interface SyncPackGroupMemberRow extends DatabaseRow {
  approved_by_device_id: string;
  authorization_id: string;
  device_id: string;
  device_kind: string;
  device_name: string;
  group_id: string;
  joined_at: string;
  left_at: string | null;
  state: string;
  updated_at: string;
}

export interface SyncPackGroupDepartureRow extends DatabaseRow {
  authorization_id: string;
  authorized_by_device_id: string;
  device_id: string;
  group_id: string;
  left_at: string;
}

export function loadSyncPackGroupRows(driver: DatabaseDriver) {
  const groups = driver.queryAll<SyncPackGroupRow>(
    `SELECT group_id, display_name, timeline_id, created_by_device_id, created_at
     FROM sync_groups WHERE group_id IN (
       SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1
     )`
  );
  const groupId = groups[0]?.group_id;
  const members = groups.length === 0 ? [] : driver.queryAll<SyncPackGroupMemberRow>(
    `SELECT group_id, device_id, device_kind, device_name, state, approved_by_device_id,
            authorization_id, joined_at, left_at, updated_at
     FROM sync_group_members
     WHERE group_id = ? AND state IN ('active', 'left') ORDER BY joined_at, device_id`,
    [groupId!]
  );
  const departures = groups.length === 0 ? [] : driver.queryAll<SyncPackGroupDepartureRow>(
    `SELECT group_id, device_id, authorized_by_device_id, authorization_id, left_at
     FROM sync_group_member_departures WHERE group_id = ? ORDER BY left_at, device_id`,
    [groupId!]
  );
  return { departures, groups, members };
}
