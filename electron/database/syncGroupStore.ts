import { randomUUID } from 'node:crypto';

import type {
  SyncGroupMemberPayload,
  SyncGroupPayload
} from '../../lib/platform/syncGroupContract.js';

import { openDatabaseConnection } from './connection.js';

interface GroupRow {
  [key: string]: null | number | string;
  created_at: string;
  created_by_device_id: string;
  display_name: string;
  group_id: string;
  local_device_id: string;
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
    `SELECT g.group_id, g.display_name, g.timeline_id, g.created_by_device_id, g.created_at,
            l.local_device_id, l.member_state AS local_member_state
     FROM sync_groups g
     JOIN sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1
     LIMIT 1`
  );
  if (!row) return null;
  const members = driver.queryAll<MemberRow>(
    `SELECT group_id, device_id, device_kind, device_name, state, approved_by_device_id,
            authorization_id, joined_at
     FROM sync_group_members
     WHERE group_id = ? AND state = 'active'
     ORDER BY joined_at ASC, device_id ASC`,
    [row.group_id]
  );
  return { ...row, members };
}

export function createDesktopSyncGroup(args: {
  deviceId: string;
  deviceKind: string;
  deviceName: string;
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
      `INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?, ?)`,
      [groupId, args.deviceName, timelineId, args.deviceId, now, now]
    );
    driver.execute(
      `INSERT INTO sync_group_members (
        group_id, device_id, device_kind, device_name, state, approved_by_device_id,
        authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)`,
      [groupId, args.deviceId, args.deviceKind, args.deviceName, args.deviceId, authorizationId, now, now]
    );
    driver.execute(
      `INSERT INTO sync_group_local_state (
        singleton_id, group_id, local_device_id, member_state, provisioning_cursor,
        created_empty_proof_json, updated_at
      ) VALUES (1, ?, ?, 'active', NULL, NULL, ?)`,
      [groupId, args.deviceId, now]
    );
  });
  return loadDesktopSyncGroup()!;
}

export function registerSyncGroupMember(args: {
  authorizationId: string;
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  approvedByDeviceId: string;
  now?: string;
}) {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const now = args.now ?? new Date().toISOString();
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    driver.execute(
      `DELETE FROM sync_group_member_departures WHERE group_id = ? AND device_id = ?`,
      [group.group_id, args.deviceId]
    );
    driver.execute(
      `INSERT INTO sync_group_members (
        group_id, device_id, device_kind, device_name, state, approved_by_device_id,
        authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)
      ON CONFLICT(group_id, device_id) DO UPDATE SET
        device_kind = excluded.device_kind,
        device_name = excluded.device_name,
        state = 'active',
        approved_by_device_id = excluded.approved_by_device_id,
        authorization_id = excluded.authorization_id,
        provisioning_cursor = NULL,
        joined_at = excluded.joined_at,
        activated_at = NULL,
        left_at = NULL,
        updated_at = excluded.updated_at`,
      [group.group_id, args.deviceId, args.deviceKind, args.deviceName, args.approvedByDeviceId,
        args.authorizationId, now, now]
    );
  });
  return loadDesktopSyncGroup()!;
}

export function joinDesktopSyncGroup(args: {
  deviceId: string;
  group: SyncGroupPayload;
  now?: string;
}) {
  if (loadDesktopSyncGroup()) throw new Error('sync_group_identity_mismatch');
  const localMember = args.group.members.find((member) => member.device_id === args.deviceId);
  if (!localMember || localMember.state !== 'active') throw new Error('sync_group_member_not_authorized');
  const now = args.now ?? new Date().toISOString();
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    driver.execute(
      'INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?, ?)',
      [args.group.group_id, args.group.display_name, args.group.timeline_id,
        args.group.created_by_device_id, args.group.created_at, now]
    );
    for (const member of args.group.members) {
      driver.execute(
        `INSERT INTO sync_group_members (
          group_id, device_id, device_kind, device_name, state, approved_by_device_id,
          authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        [args.group.group_id, member.device_id, member.device_kind, member.device_name, member.state,
          member.approved_by_device_id, member.authorization_id,
          null,
          member.joined_at, now]
      );
    }
    driver.execute(
      `INSERT INTO sync_group_local_state (
        singleton_id, group_id, local_device_id, member_state, provisioning_cursor,
        created_empty_proof_json, updated_at
      ) VALUES (1, ?, ?, 'active', NULL, NULL, ?)`,
      [args.group.group_id, args.deviceId, now]
    );
  });
  return loadDesktopSyncGroup()!;
}

export function isActiveSyncGroupMember(groupId: string, deviceId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ present: number }>(
    `SELECT 1 AS present FROM sync_group_members
     WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1`,
    [groupId, deviceId]
  );
  return row?.present === 1;
}

export function loadSyncGroupMemberAuthorization(groupId: string, deviceId: string) {
  return openDatabaseConnection().driver.queryOne<{
    [key: string]: null | number | string;
    authorization_id: string;
    state: 'active';
  }>(
    `SELECT authorization_id, state FROM sync_group_members
     WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1`,
    [groupId, deviceId]
  );
}

export function recordSyncGroupDeparture(args: {
  authorizationId: string;
  authorizedByDeviceId: string;
  deviceId: string;
  groupId: string;
  leftAt: string;
  local?: boolean;
}) {
  if (args.authorizedByDeviceId !== args.deviceId) throw new Error('sync_group_departure_authorization_invalid');
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    const member = driver.queryOne<{ joined_at: string; state: string }>(
      'SELECT joined_at, state FROM sync_group_members WHERE group_id = ? AND device_id = ? LIMIT 1',
      [args.groupId, args.deviceId]
    );
    if (!member || args.leftAt < member.joined_at) throw new Error('sync_group_departure_authorization_invalid');
    driver.execute(
      `INSERT INTO sync_group_member_departures
        (group_id, device_id, authorized_by_device_id, authorization_id, left_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(group_id, device_id) DO NOTHING`,
      [args.groupId, args.deviceId, args.authorizedByDeviceId, args.authorizationId, args.leftAt]
    );
    driver.execute(
      `UPDATE sync_group_members SET state = 'left', left_at = ?, updated_at = ?
       WHERE group_id = ? AND device_id = ?`,
      [args.leftAt, args.leftAt, args.groupId, args.deviceId]
    );
    if (args.local) {
      driver.execute('DELETE FROM sync_group_local_state WHERE singleton_id = 1 AND local_device_id = ?',
        [args.deviceId]);
    }
  });
}
