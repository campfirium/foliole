import { randomBytes, randomUUID } from 'node:crypto';

import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import type { SyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { openDatabaseConnection } from './connection.js';

interface GroupRow {
  [key: string]: null | number | string;
  created_at: string;
  display_name: string;
  group_id: string;
  local_device_identity_key: string;
}

interface DeviceRow extends Omit<SyncGroupDevicePayload, 'contract_version'> {
  [key: string]: null | number | string;
}

export function loadDesktopSyncGroup(): SyncGroupPayload | null {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<GroupRow>(
    `SELECT g.group_id, g.display_name, g.created_at, l.local_device_identity_key
     FROM sync_groups g JOIN sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1 AND l.state = 'active' LIMIT 1`
  );
  if (!row) return null;
  const devices = driver.queryAll<DeviceRow>(
    `SELECT group_id, device_identity_key, device_anchor, canonical_library_path,
            device_name, platform, state, joined_at, left_at, last_seen_at, updated_at
     FROM sync_group_devices WHERE group_id = ? AND state = 'active'
     ORDER BY joined_at, device_identity_key`,
    [row.group_id]
  ).map((device) => ({ ...device, contract_version: 1 as const }));
  return { ...row, devices };
}

export function loadDesktopSyncGroupInfo() {
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const row = openDatabaseConnection().driver.queryOne<{ workgroup_key: string }>(
    'SELECT workgroup_key FROM sync_groups WHERE group_id = ?', [group.group_id]
  );
  if (!row) throw new Error('sync_group_workgroup_key_missing');
  return { display_name: group.display_name, group_id: group.group_id, workgroup_key: row.workgroup_key };
}

export function createDesktopSyncGroup(args: {
  device: SyncGroupDeviceIdentity;
  deviceName: string;
  displayName?: string;
  now?: string;
  platform: string;
  workgroupKey?: string;
}) {
  const existing = loadDesktopSyncGroup();
  if (existing) return existing;
  const now = args.now ?? new Date().toISOString();
  const workgroupKey = args.workgroupKey ?? randomBytes(32).toString('base64url');
  writeGroupAndLocalDevice({
    createdAt: now, device: args.device, deviceName: args.deviceName,
    displayName: args.displayName ?? args.deviceName, platform: args.platform, workgroupKey
  });
  return loadDesktopSyncGroup()!;
}

export function joinDesktopSyncGroup(args: {
  device: SyncGroupDeviceIdentity;
  deviceName: string;
  displayName: string;
  now?: string;
  platform: string;
  workgroupKey: string;
}) {
  if (loadDesktopSyncGroup()) throw new Error('sync_group_identity_mismatch');
  const now = args.now ?? new Date().toISOString();
  writeGroupAndLocalDevice({
    createdAt: now, device: args.device, deviceName: args.deviceName,
    displayName: args.displayName, platform: args.platform, workgroupKey: args.workgroupKey
  });
  return loadDesktopSyncGroup()!;
}

export function registerSyncGroupDevice(args: {
  device: SyncGroupDeviceIdentity;
  deviceName: string;
  now?: string;
  platform: string;
}) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== args.device.group_id) throw new Error('sync_group_not_available');
  const now = args.now ?? new Date().toISOString();
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_group_devices (
      group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
      platform, state, joined_at, left_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET device_name = excluded.device_name,
      platform = excluded.platform, state = 'active', left_at = NULL,
      last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
    deviceValues(args.device, args.deviceName, args.platform, now)
  );
  return loadDesktopSyncGroup()!;
}

export function leaveDesktopSyncGroupDevice(deviceIdentityKey: string, leftAt = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    driver.execute(
      `UPDATE sync_group_devices SET state = 'left', left_at = ?, updated_at = ?
       WHERE device_identity_key = ? AND state = 'active'`,
      [leftAt, leftAt, deviceIdentityKey]
    );
    const local = driver.queryOne<{ local_device_identity_key: string }>(
      'SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1'
    );
    if (local?.local_device_identity_key === deviceIdentityKey) {
      driver.execute('DELETE FROM sync_group_local_state WHERE singleton_id = 1');
      driver.execute('DELETE FROM sync_delivery_receipts');
      driver.execute('DELETE FROM sync_peer_cursors');
      driver.execute('DELETE FROM sync_group_nonce_ledger');
    }
  });
}

export function newSyncGroupId() {
  return `group-${randomUUID()}`;
}

function writeGroupAndLocalDevice(args: {
  createdAt: string;
  device: SyncGroupDeviceIdentity;
  deviceName: string;
  displayName: string;
  platform: string;
  workgroupKey: string;
}) {
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    driver.execute(
      `INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [args.device.group_id, args.displayName, args.workgroupKey, args.createdAt, args.createdAt]
    );
    driver.execute(
      `INSERT INTO sync_group_devices (
        group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
        platform, state, joined_at, left_at, last_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
      deviceValues(args.device, args.deviceName, args.platform, args.createdAt)
    );
    driver.execute(
      `INSERT INTO sync_group_local_state
        (singleton_id, group_id, local_device_identity_key, state, updated_at)
       VALUES (1, ?, ?, 'active', ?)`,
      [args.device.group_id, args.device.identity_key, args.createdAt]
    );
  });
}

function deviceValues(identity: SyncGroupDeviceIdentity, name: string, platform: string, now: string) {
  return [identity.group_id, identity.identity_key, identity.device_anchor,
    identity.canonical_library_path, name, platform, now, now, now];
}
