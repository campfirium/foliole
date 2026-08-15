import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { updateLocalSyncGroupDeviceName } from './syncGroupIdentityStore.js';
import {
  createDesktopSyncGroup,
  loadDesktopSyncGroup,
  recordSyncGroupDeparture,
  registerSyncGroupMember
} from './syncGroupStore.js';
import {
  consumeDesktopSyncGroupNonce,
  loadDesktopSyncGroupWorkgroupKey,
  saveDesktopSyncGroupWorkgroupKey
} from './syncGroupWorkgroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('CREATE TABLE sync_object_state (state_seq INTEGER)');
  sqlite.exec('CREATE TABLE sync_delivery_receipts (peer_id TEXT)');
  sqlite.exec('CREATE TABLE sync_peer_cursors (peer_id TEXT)');
  connection.current = { driver: createBetterSqlite3Driver(sqlite) };
});

afterEach(() => sqlite.close());

it('persists one stable desktop-created group and idempotent founder membership', () => {
  const first = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-08T00:00:00.000Z'
  });
  const second = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Renamed', now: '2026-08-09T00:00:00.000Z'
  });
  expect(second).toEqual(first);
  expect(loadDesktopSyncGroup()).toMatchObject({
    display_name: 'Studio', group_id: first.group_id, local_member_state: 'active', timeline_id: first.timeline_id
  });
  expect(first.members).toHaveLength(1);
});

it('keeps the workgroup key and replay ledger in the library database', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio'
  });
  const key = Buffer.alloc(32, 3).toString('base64url');
  saveDesktopSyncGroupWorkgroupKey(group.group_id, key);
  expect(loadDesktopSyncGroupWorkgroupKey(group.group_id)).toBe(key);
  expect(consumeDesktopSyncGroupNonce(group.group_id, 'nonce-1', 100, 200)).toBe(true);
  expect(consumeDesktopSyncGroupNonce(group.group_id, 'nonce-1', 100, 200)).toBe(false);
});

it('persists an approved device as a member without a second activation', () => {
  createDesktopSyncGroup({ deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio' });
  const group = registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-1', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel'
  });
  expect(group.members.find((member) => member.device_id === 'Pixel')).toMatchObject({
    approved_by_device_id: 'desktop-1', state: 'active'
  });
});

it('atomically assigns stable readable identities to same-name members', () => {
  createDesktopSyncGroup({ deviceId: 'Maci', deviceKind: 'darwin', deviceName: 'Maci' });
  const second = registerSyncGroupMember({
    approvedByDeviceId: 'Maci', authorizationId: 'request-2', deviceId: 'android-2',
    deviceKind: 'darwin', deviceName: 'Maci', now: '2026-08-09T01:00:00Z'
  });
  const repeated = registerSyncGroupMember({
    approvedByDeviceId: 'Maci', authorizationId: 'request-2', deviceId: 'android-2',
    deviceKind: 'darwin', deviceName: 'Maci', now: '2026-08-09T02:00:00Z'
  });
  expect(second.members.map((member) => member.device_name).sort()).toEqual(['Maci', 'Maci 2']);
  expect(repeated.members).toEqual(second.members);
});

it('keeps an explicitly approved credential recovery on the existing active member', () => {
  createDesktopSyncGroup({ deviceId: 'Studio', deviceKind: 'darwin', deviceName: 'Studio' });
  const joined = registerSyncGroupMember({
    approvedByDeviceId: 'Studio', authorizationId: 'join-a5', deviceId: 'installation-a5',
    deviceKind: 'android-capacitor', deviceName: 'Xiaomi 23049RAD8C'
  });
  const recovered = registerSyncGroupMember({
    approvedByDeviceId: 'Studio', authorizationId: 'recover-a5', deviceId: 'Xiaomi 23049RAD8C',
    deviceKind: 'android-capacitor', deviceName: 'Xiaomi 23049RAD8C'
  });

  expect(recovered.members).toEqual(joined.members);
  expect(recovered.members).toHaveLength(2);
  expect(recovered.members.find((member) => member.device_id === 'Xiaomi 23049RAD8C'))
    .toMatchObject({ authorization_id: 'join-a5', device_name: 'Xiaomi 23049RAD8C' });
});

it('persists the current host name for an existing local membership', () => {
  createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'darwin', deviceName: 'Foliole Desktop on Maci.local',
    now: '2026-08-08T00:00:00.000Z'
  });

  const group = updateLocalSyncGroupDeviceName('Maci', '2026-08-11T00:00:00.000Z');

  expect(group?.members[0]).toMatchObject({ device_name: 'Maci' });
  expect(sqlite.prepare("SELECT device_name, updated_at FROM sync_group_members WHERE device_id = 'desktop-1'").get())
    .toEqual({ device_name: 'Maci', updated_at: '2026-08-11T00:00:00.000Z' });
});

it('reuses a released name with a fresh approval generation', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-old', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T01:00:00Z'
  });
  recordSyncGroupDeparture({
    authorizationId: 'leave-Pixel', authorizedByDeviceId: 'Pixel', deviceId: 'Pixel',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z'
  });

  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-new', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T03:00:00Z'
  });

  expect(sqlite.prepare(`SELECT device_id, device_name, state, authorization_id, joined_at, left_at
    FROM sync_group_members WHERE authorization_id = 'request-new'`).get()).toEqual({
    authorization_id: 'request-new', device_id: 'Pixel', device_name: 'Pixel',
    joined_at: '2026-08-09T03:00:00Z', left_at: null, state: 'active'
  });
  expect(sqlite.prepare(`SELECT COUNT(*) AS value FROM sync_group_member_departures
    WHERE device_id = 'Pixel'`).get()).toEqual({ value: 0 });
});

it('records a new departure after a released name is approved again', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'Studio', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({ approvedByDeviceId: 'Studio', authorizationId: 'join-old', deviceId: 'ignored',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T01:00:00Z' });
  recordSyncGroupDeparture({ authorizationId: 'leave-old', authorizedByDeviceId: 'Pixel',
    deviceId: 'Pixel', groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z' });
  registerSyncGroupMember({ approvedByDeviceId: 'Studio', authorizationId: 'join-new', deviceId: 'ignored',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T03:00:00Z' });
  recordSyncGroupDeparture({ authorizationId: 'leave-new', authorizedByDeviceId: 'Pixel',
    deviceId: 'Pixel', groupId: group.group_id, leftAt: '2026-08-09T04:00:00Z' });

  expect(sqlite.prepare(`SELECT m.state, m.authorization_id AS join_authorization,
      d.authorization_id AS leave_authorization, d.left_at
    FROM sync_group_members m JOIN sync_group_member_departures d USING (group_id, device_id)
    WHERE m.device_id = 'Pixel'`).get()).toEqual({
    join_authorization: 'join-new', leave_authorization: 'leave-new',
    left_at: '2026-08-09T04:00:00Z', state: 'left'
  });
});

it('records a self-authorized departure and unbinds only the local departing Device', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-1', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T01:00:00Z'
  });
  saveDesktopSyncGroupWorkgroupKey(group.group_id, Buffer.alloc(32, 4).toString('base64url'));
  sqlite.exec("INSERT INTO sync_delivery_receipts VALUES ('Pixel')");
  sqlite.exec("INSERT INTO sync_peer_cursors VALUES ('Pixel')");
  recordSyncGroupDeparture({
    authorizationId: 'leave-desktop-1', authorizedByDeviceId: 'desktop-1', deviceId: 'desktop-1',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z', local: true
  });

  expect(loadDesktopSyncGroup()).toBeNull();
  expect(loadDesktopSyncGroupWorkgroupKey(group.group_id)).toBeNull();
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE device_id = 'Pixel'").get())
    .toEqual({ state: 'active' });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_delivery_receipts').get()).toEqual({ value: 0 });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_peer_cursors').get()).toEqual({ value: 0 });
  expect(sqlite.prepare("SELECT authorized_by_device_id FROM sync_group_member_departures").get())
    .toEqual({ authorized_by_device_id: 'desktop-1' });
});

it('records an active member removing another member', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-1', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T01:00:00Z'
  });
  recordSyncGroupDeparture({
    authorizationId: 'remove-Pixel', authorizedByDeviceId: 'desktop-1', deviceId: 'Pixel',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z'
  });
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE device_id = 'Pixel'").get())
    .toEqual({ state: 'left' });
  expect(sqlite.prepare("SELECT authorized_by_device_id FROM sync_group_member_departures").get())
    .toEqual({ authorized_by_device_id: 'desktop-1' });
});
