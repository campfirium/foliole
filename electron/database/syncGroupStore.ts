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
            authorization_id, joined_at, activated_at
     FROM sync_group_members
     WHERE group_id = ? AND state != 'left'
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
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, ?, NULL, ?)`,
      [groupId, args.deviceId, args.deviceKind, args.deviceName, args.deviceId, authorizationId, now, now, now]
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

export function registerProvisioningSyncGroupMember(args: {
  authorizationId: string;
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  approvedByDeviceId: string;
  provisioningCursor: number;
  now?: string;
}) {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const now = args.now ?? new Date().toISOString();
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, ?, 'provisioning', ?, ?, ?, ?, NULL, NULL, ?)
    ON CONFLICT(group_id, device_id) DO UPDATE SET
      device_kind = excluded.device_kind,
      device_name = excluded.device_name,
      state = CASE WHEN sync_group_members.state = 'active' THEN 'active' ELSE 'provisioning' END,
      approved_by_device_id = excluded.approved_by_device_id,
      authorization_id = excluded.authorization_id,
      provisioning_cursor = excluded.provisioning_cursor,
      updated_at = excluded.updated_at`,
    [group.group_id, args.deviceId, args.deviceKind, args.deviceName, args.approvedByDeviceId,
      args.authorizationId, args.provisioningCursor, now, now]
  );
  return loadDesktopSyncGroup()!;
}

export function beginDesktopSyncGroupProvisioning(args: {
  deviceId: string;
  emptyProof: unknown;
  group: SyncGroupPayload;
  provisioningCursor: number;
  now?: string;
}) {
  if (loadDesktopSyncGroup()) throw new Error('sync_group_identity_mismatch');
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [args.group.group_id, member.device_id, member.device_kind, member.device_name, member.state,
          member.approved_by_device_id, member.authorization_id,
          member.device_id === args.deviceId ? args.provisioningCursor : null,
          member.joined_at, member.activated_at, now]
      );
    }
    driver.execute(
      `INSERT INTO sync_group_local_state (
        singleton_id, group_id, local_device_id, member_state, provisioning_cursor,
        created_empty_proof_json, updated_at
      ) VALUES (1, ?, ?, 'provisioning', ?, ?, ?)`,
      [args.group.group_id, args.deviceId, args.provisioningCursor, JSON.stringify(args.emptyProof), now]
    );
  });
  return loadDesktopSyncGroup()!;
}

export function activateDesktopSyncGroupProvisioning(completedCursor: number, now = new Date().toISOString()) {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'provisioning') throw new Error('sync_group_identity_mismatch');
  if (completedCursor < loadDesktopProvisioningCursor()) throw new Error('sync_group_provisioning_incomplete');
  openDatabaseConnection().driver.transaction(() => {
    openDatabaseConnection().driver.execute(
      `UPDATE sync_group_local_state SET member_state = 'active', provisioning_cursor = NULL,
       created_empty_proof_json = NULL, updated_at = ? WHERE singleton_id = 1`, [now]
    );
    openDatabaseConnection().driver.execute(
      `UPDATE sync_group_members SET state = 'active', activated_at = COALESCE(activated_at, ?),
       provisioning_cursor = NULL, updated_at = ? WHERE group_id = ? AND device_id = ?`,
      [now, now, group.group_id, group.local_device_id]
    );
  });
  return loadDesktopSyncGroup()!;
}

function loadDesktopProvisioningCursor() {
  return Number(openDatabaseConnection().driver.queryOne<{ value: number }>(
    'SELECT COALESCE(provisioning_cursor, 0) AS value FROM sync_group_local_state WHERE singleton_id = 1'
  )?.value ?? 0);
}

export function loadDesktopSyncGroupTimelineCursor() {
  return Number(openDatabaseConnection().driver.queryOne<{ value: number }>(
    'SELECT COALESCE(MAX(state_seq), 0) AS value FROM sync_object_state'
  )?.value ?? 0);
}

export function activateSyncGroupMember(args: {
  authorizationId: string;
  deviceId: string;
  groupId: string;
  timelineId: string;
  completedCursor: number;
  now?: string;
}) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== args.groupId || group.timeline_id !== args.timelineId) {
    throw new Error('sync_group_identity_mismatch');
  }
  const now = args.now ?? new Date().toISOString();
  const result = openDatabaseConnection().driver.execute(
    `UPDATE sync_group_members
     SET state = 'active', activated_at = COALESCE(activated_at, ?), updated_at = ?
     WHERE group_id = ? AND device_id = ? AND authorization_id = ?
       AND state IN ('provisioning', 'active') AND ? >= COALESCE(provisioning_cursor, 0)`,
    [now, now, group.group_id, args.deviceId, args.authorizationId, args.completedCursor]
  );
  if (result.changes !== 1) throw new Error('sync_group_member_not_authorized');
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
    state: 'active' | 'provisioning';
  }>(
    `SELECT authorization_id, state FROM sync_group_members
     WHERE group_id = ? AND device_id = ? AND state IN ('active', 'provisioning') LIMIT 1`,
    [groupId, deviceId]
  );
}
