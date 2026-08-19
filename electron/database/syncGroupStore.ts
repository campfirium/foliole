import { randomUUID } from 'node:crypto';

import type {
  SyncGroupMemberPayload,
  SyncGroupPayload
} from '../../lib/platform/syncGroupContract.js';

import { openDatabaseConnection } from './connection.js';
import { saveApprovedSyncGroupMember } from './syncGroupMemberRegistration.js';

interface GroupRow {
  [key: string]: null | number | string;
  created_at: string;
  created_by_host_name: string;
  display_name: string;
  group_id: string;
  local_host_name: string;
  local_member_state: SyncGroupPayload['local_member_state'];
  timeline_id: string;
}

interface MemberRow extends SyncGroupMemberPayload {
  [key: string]: null | number | string;
  group_id: string;
}

export function loadDesktopSyncGroup(): SyncGroupPayload | null {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<GroupRow>(
    `SELECT g.group_id, g.display_name, g.timeline_id, g.created_by_host_name, g.created_at,
            l.local_host_name, l.member_state AS local_member_state
     FROM sync_groups g
     JOIN sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1
     LIMIT 1`
  );
  if (!row) return null;
  const members = driver.queryAll<MemberRow>(
    `SELECT group_id, host_name, host_platform, state, approved_by_host_name,
            authorization_id, joined_at
     FROM sync_group_members
     WHERE group_id = ? AND state = 'active'
     ORDER BY joined_at ASC, host_name ASC`,
    [row.group_id]
  );
  return { ...row, members };
}

export function createDesktopSyncGroup(args: {
  hostName: string;
  hostPlatform: string;
  now?: string;
}) {
  const existing = loadDesktopSyncGroup();
  if (existing) return existing;
  const driver = openDatabaseConnection().driver;
  const groupId = `group-${randomUUID()}`;
  const timelineId = `timeline-${randomUUID()}`;
  const authorizationId = `founder-${randomUUID()}`;
  const now = args.now ?? new Date().toISOString();
  driver.transaction(() => {
    driver.execute(
      `INSERT INTO sync_groups (
        group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at, workgroup_key
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [groupId, args.hostName, timelineId, args.hostName, now, now]
    );
    driver.execute(
      `INSERT INTO sync_group_members (
        group_id, host_name, host_platform, state, approved_by_host_name,
        authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)`,
      [groupId, args.hostName, args.hostPlatform, args.hostName, authorizationId, now, now]
    );
    driver.execute(
      `INSERT INTO sync_group_local_state (
        singleton_id, group_id, local_host_name, member_state, provisioning_cursor,
        created_empty_proof_json, updated_at
      ) VALUES (1, ?, ?, 'active', NULL, NULL, ?)`,
      [groupId, args.hostName, now]
    );
  });
  return loadDesktopSyncGroup()!;
}

export function registerSyncGroupMember(args: {
  authorizationId: string;
  hostName: string;
  hostPlatform: string;
  approvedByHostName: string;
  now?: string;
}) {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const now = args.now ?? new Date().toISOString();
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    saveApprovedSyncGroupMember({ ...args, groupId: group.group_id, now }, driver);
  });
  return loadDesktopSyncGroup()!;
}

export function joinDesktopSyncGroup(args: {
  hostName: string;
  group: SyncGroupPayload;
  now?: string;
  workgroupKey: string;
}) {
  if (loadDesktopSyncGroup()) throw new Error('sync_group_identity_mismatch');
  const localMember = args.group.members.find((member) => member.host_name === args.hostName);
  if (!localMember || localMember.state !== 'active') throw new Error('sync_group_member_not_authorized');
  const now = args.now ?? new Date().toISOString();
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    driver.execute(
      `INSERT INTO sync_groups (
        group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at, workgroup_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [args.group.group_id, args.group.display_name, args.group.timeline_id,
        args.group.created_by_host_name, args.group.created_at, now, args.workgroupKey]
    );
    for (const member of args.group.members) {
      driver.execute(
        `INSERT INTO sync_group_members (
          group_id, host_name, host_platform, state, approved_by_host_name,
          authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        [args.group.group_id, member.host_name, member.host_platform, member.state,
          member.approved_by_host_name, member.authorization_id,
          null,
          member.joined_at, now]
      );
    }
    driver.execute(
      `INSERT INTO sync_group_local_state (
        singleton_id, group_id, local_host_name, member_state, provisioning_cursor,
        created_empty_proof_json, updated_at
      ) VALUES (1, ?, ?, 'active', NULL, NULL, ?)`,
      [args.group.group_id, args.hostName, now]
    );
  });
  return loadDesktopSyncGroup()!;
}

export function isActiveSyncGroupMember(groupId: string, hostName: string) {
  const row = openDatabaseConnection().driver.queryOne<{ present: number }>(
    `SELECT 1 AS present FROM sync_group_members
     WHERE group_id = ? AND host_name = ? AND state = 'active' LIMIT 1`,
    [groupId, hostName]
  );
  return row?.present === 1;
}

export function loadSyncGroupMemberAuthorization(groupId: string, hostName: string) {
  return openDatabaseConnection().driver.queryOne<{
    [key: string]: null | number | string;
    authorization_id: string;
    state: 'active';
  }>(
    `SELECT authorization_id, state FROM sync_group_members
     WHERE group_id = ? AND host_name = ? AND state = 'active' LIMIT 1`,
    [groupId, hostName]
  );
}

export function loadSyncGroupMemberByAuthorization(groupId: string, authorizationId: string) {
  return openDatabaseConnection().driver.queryOne<{
    authorization_id: string;
    host_name: string;
    state: 'active';
  }>(
    `SELECT authorization_id, host_name, state FROM sync_group_members
     WHERE group_id = ? AND authorization_id = ? AND state = 'active' LIMIT 1`,
    [groupId, authorizationId]
  );
}

export function recordSyncGroupDeparture(args: {
  authorizationId: string;
  authorizedByHostName: string;
  hostName: string;
  groupId: string;
  leftAt: string;
  local?: boolean;
}) {
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    const member = driver.queryOne<{ joined_at: string; state: string }>(
      'SELECT joined_at, state FROM sync_group_members WHERE group_id = ? AND host_name = ? LIMIT 1',
      [args.groupId, args.hostName]
    );
    const authorizer = driver.queryOne<{ joined_at: string; left_at: string | null }>(
      'SELECT joined_at, left_at FROM sync_group_members WHERE group_id = ? AND host_name = ? LIMIT 1',
      [args.groupId, args.authorizedByHostName]
    );
    if (!member || !authorizer || args.leftAt < member.joined_at || args.leftAt < authorizer.joined_at
      || (authorizer.left_at && authorizer.left_at < args.leftAt)) {
      throw new Error('sync_group_departure_authorization_invalid');
    }
    driver.execute(
      `INSERT INTO sync_group_member_departures
        (group_id, host_name, authorized_by_host_name, authorization_id, left_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(group_id, host_name) DO UPDATE SET
         authorized_by_host_name = excluded.authorized_by_host_name,
         authorization_id = excluded.authorization_id,
         left_at = excluded.left_at
       WHERE excluded.left_at > sync_group_member_departures.left_at`,
      [args.groupId, args.hostName, args.authorizedByHostName, args.authorizationId, args.leftAt]
    );
    driver.execute(
      `UPDATE sync_group_members SET state = 'left', left_at = ?, updated_at = ?
       WHERE group_id = ? AND host_name = ?`,
      [args.leftAt, args.leftAt, args.groupId, args.hostName]
    );
    if (args.local) {
      driver.execute('UPDATE sync_groups SET workgroup_key = NULL, updated_at = ? WHERE group_id = ?',
        [args.leftAt, args.groupId]);
      driver.execute('DELETE FROM sync_delivery_receipts');
      driver.execute('DELETE FROM sync_peer_cursors');
      driver.execute('DELETE FROM sync_group_local_state WHERE singleton_id = 1 AND local_host_name = ?',
        [args.hostName]);
    }
  });
}
