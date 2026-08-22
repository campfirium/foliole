import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

export interface SyncPackGroupRow extends DatabaseRow {
  created_at: string;
  created_by_host_name: string;
  display_name: string;
  group_id: string;
  timeline_id: string;
}

export interface SyncPackGroupMemberRow extends DatabaseRow {
  approved_by_host_name: string;
  authorization_id: string;
  host_name: string;
  host_platform: string;
  group_id: string;
  joined_at: string;
  left_at: string | null;
  state: string;
  updated_at: string;
}

export interface SyncPackGroupDepartureRow extends DatabaseRow {
  authorization_id: string;
  authorized_by_host_name: string;
  host_name: string;
  group_id: string;
  left_at: string;
}

export function loadSyncPackGroupRows(driver: DatabaseDriver) {
  const groups = driver.queryAll<SyncPackGroupRow>(
    `SELECT group_id, display_name, timeline_id, created_by_host_name, created_at
     FROM sync_groups WHERE group_id IN (
       SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1
     )`
  );
  const groupId = groups[0]?.group_id;
  const members = groups.length === 0 ? [] : driver.queryAll<SyncPackGroupMemberRow>(
    `SELECT group_id, host_name, host_platform, state, approved_by_host_name,
            authorization_id, joined_at, left_at, updated_at
     FROM sync_group_members
     WHERE group_id = ? AND state IN ('active', 'left') ORDER BY joined_at, host_name`,
    [groupId!]
  );
  const departures = groups.length === 0 ? [] : driver.queryAll<SyncPackGroupDepartureRow>(
    `SELECT departure.group_id, departure.host_name, departure.authorized_by_host_name,
            departure.authorization_id, departure.left_at
     FROM sync_group_member_departures departure
     WHERE departure.group_id = ? AND EXISTS (
       SELECT 1 FROM sync_group_members member WHERE member.group_id = departure.group_id
         AND (member.host_name = departure.host_name
           OR member.authorization_id = departure.authorization_id)
     ) ORDER BY departure.left_at, departure.host_name`,
    [groupId!]
  );
  return { departures, groups, members };
}
