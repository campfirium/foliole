import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { updateLocalSyncGroupHostName } from './syncGroupIdentityStore.js';
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
    hostName: 'desktop-1', hostPlatform: 'desktop', now: '2026-08-08T00:00:00.000Z'
  });
  const second = createDesktopSyncGroup({
    hostName: 'desktop-1', hostPlatform: 'desktop', now: '2026-08-09T00:00:00.000Z'
  });
  expect(second).toEqual(first);
  expect(loadDesktopSyncGroup()).toMatchObject({
    display_name: 'desktop-1', group_id: first.group_id, local_member_state: 'active', timeline_id: first.timeline_id
  });
  expect(first.members).toHaveLength(1);
});

it('keeps the workgroup key and replay ledger in the library database', () => {
  const group = createDesktopSyncGroup({
    hostName: 'desktop-1', hostPlatform: 'desktop'
  });
  const key = Buffer.alloc(32, 3).toString('base64url');
  saveDesktopSyncGroupWorkgroupKey(group.group_id, key);
  expect(loadDesktopSyncGroupWorkgroupKey(group.group_id)).toBe(key);
  expect(consumeDesktopSyncGroupNonce(group.group_id, 'nonce-1', 100, 200)).toBe(true);
  expect(consumeDesktopSyncGroupNonce(group.group_id, 'nonce-1', 100, 200)).toBe(false);
});

it('persists an approved device as a member without a second activation', () => {
  createDesktopSyncGroup({ hostName: 'desktop-1', hostPlatform: 'desktop'});
  const group = registerSyncGroupMember({
    approvedByHostName: 'desktop-1', authorizationId: 'request-1', hostName: 'android-1',
    hostPlatform: 'android-capacitor'
  });
  expect(group.members.find((member) => member.host_name === 'android-1')).toMatchObject({
    approved_by_host_name: 'desktop-1', state: 'active'
  });
});

it('atomically assigns stable readable identities to same-name members', () => {
  createDesktopSyncGroup({ hostName: 'Maci', hostPlatform: 'darwin'});
  const second = registerSyncGroupMember({
    approvedByHostName: 'Maci', authorizationId: 'request-2', hostName: 'Maci',
    hostPlatform: 'darwin', now: '2026-08-09T01:00:00Z'
  });
  const repeated = registerSyncGroupMember({
    approvedByHostName: 'Maci', authorizationId: 'request-2', hostName: 'Maci',
    hostPlatform: 'darwin', now: '2026-08-09T02:00:00Z'
  });
  expect(second.members.map((member) => member.host_name).sort()).toEqual(['Maci', 'Maci 2']);
  expect(repeated.members).toEqual(second.members);
});

it('keeps an explicitly approved credential recovery on the existing active member', () => {
  createDesktopSyncGroup({ hostName: 'Studio', hostPlatform: 'darwin'});
  const joined = registerSyncGroupMember({
    approvedByHostName: 'Studio', authorizationId: 'join-a5', hostName: 'installation-a5',
    hostPlatform: 'android-capacitor', now: '2026-08-09T01:00:00Z'
  });
  const recovered = registerSyncGroupMember({
    approvedByHostName: 'Studio', authorizationId: 'join-a5', hostName: 'Xiaomi 23049RAD8C',
    hostPlatform: 'android-capacitor', now: '2026-08-09T02:00:00Z'
  });

  expect(joined.members).toHaveLength(2);
  expect(recovered.members).toHaveLength(2);
  expect(recovered.members.find((member) => member.host_name === 'Xiaomi 23049RAD8C'))
    .toMatchObject({ authorization_id: 'join-a5', host_name: 'Xiaomi 23049RAD8C' });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_group_member_departures').get())
    .toEqual({ value: 0 });
});

it('persists the current host name for an existing local membership', () => {
  createDesktopSyncGroup({
    hostName: 'desktop-1', hostPlatform: 'darwin',
    now: '2026-08-08T00:00:00.000Z'
  });

  const group = updateLocalSyncGroupHostName('Maci', '2026-08-11T00:00:00.000Z');

  expect(group?.members[0]).toMatchObject({ host_name: 'Maci' });
  expect(sqlite.prepare("SELECT host_name, updated_at FROM sync_group_members WHERE host_name = 'Maci'").get())
    .toEqual({ host_name: 'Maci', updated_at: '2026-08-11T00:00:00.000Z' });
});

it('reuses a released name with a fresh approval generation', () => {
  const group = createDesktopSyncGroup({
    hostName: 'desktop-1', hostPlatform: 'desktop', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByHostName: 'desktop-1', authorizationId: 'request-old', hostName: 'android-1',
    hostPlatform: 'android-capacitor', now: '2026-08-09T01:00:00Z'
  });
  recordSyncGroupDeparture({
    authorizationId: 'leave-android-1', authorizedByHostName: 'android-1', hostName: 'android-1',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z'
  });

  registerSyncGroupMember({
    approvedByHostName: 'desktop-1', authorizationId: 'request-new', hostName: 'android-1',
    hostPlatform: 'android-capacitor', now: '2026-08-09T03:00:00Z'
  });

  expect(sqlite.prepare(`SELECT host_name, state, authorization_id, joined_at, left_at
    FROM sync_group_members WHERE authorization_id = 'request-new'`).get()).toEqual({
    authorization_id: 'request-new', host_name: 'android-1',
    joined_at: '2026-08-09T03:00:00Z', left_at: null, state: 'active'
  });
  expect(sqlite.prepare(`SELECT COUNT(*) AS value FROM sync_group_member_departures
    WHERE host_name = 'android-1'`).get()).toEqual({ value: 0 });
});

it('renames an existing authorization onto a released Host name', () => {
  const group = createDesktopSyncGroup({
    hostName: 'Studio', hostPlatform: 'desktop', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({ approvedByHostName: 'Studio', authorizationId: 'released-auth',
    hostName: 'Pixel', hostPlatform: 'android-capacitor', now: '2026-08-09T01:00:00Z' });
  recordSyncGroupDeparture({ authorizationId: 'released-leave', authorizedByHostName: 'Pixel',
    hostName: 'Pixel', groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z' });
  registerSyncGroupMember({ approvedByHostName: 'Studio', authorizationId: 'active-auth',
    hostName: 'A5', hostPlatform: 'android-capacitor', now: '2026-08-09T03:00:00Z' });

  registerSyncGroupMember({ approvedByHostName: 'Studio', authorizationId: 'active-auth',
    hostName: 'Pixel', hostPlatform: 'android-capacitor', now: '2026-08-09T04:00:00Z' });

  expect(sqlite.prepare("SELECT host_name, authorization_id, state FROM sync_group_members WHERE host_name = 'Pixel'").all())
    .toEqual([{ authorization_id: 'active-auth', host_name: 'Pixel', state: 'active' }]);
});

it('records a new departure after a released name is approved again', () => {
  const group = createDesktopSyncGroup({
    hostName: 'Studio', hostPlatform: 'desktop', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({ approvedByHostName: 'Studio', authorizationId: 'join-old', hostName: 'Pixel',
    hostPlatform: 'android-capacitor', now: '2026-08-09T01:00:00Z' });
  recordSyncGroupDeparture({ authorizationId: 'leave-old', authorizedByHostName: 'Pixel',
    hostName: 'Pixel', groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z' });
  registerSyncGroupMember({ approvedByHostName: 'Studio', authorizationId: 'join-new', hostName: 'Pixel',
    hostPlatform: 'android-capacitor', now: '2026-08-09T03:00:00Z' });
  recordSyncGroupDeparture({ authorizationId: 'leave-new', authorizedByHostName: 'Pixel',
    hostName: 'Pixel', groupId: group.group_id, leftAt: '2026-08-09T04:00:00Z' });

  expect(sqlite.prepare(`SELECT m.state, m.authorization_id AS join_authorization,
      d.authorization_id AS leave_authorization, d.left_at
    FROM sync_group_members m JOIN sync_group_member_departures d USING (group_id, host_name)
    WHERE m.host_name = 'Pixel'`).get()).toEqual({
    join_authorization: 'join-new', leave_authorization: 'leave-new',
    left_at: '2026-08-09T04:00:00Z', state: 'left'
  });
});

it('records a self-authorized departure and unbinds only the local departing Device', () => {
  const group = createDesktopSyncGroup({
    hostName: 'desktop-1', hostPlatform: 'desktop', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByHostName: 'desktop-1', authorizationId: 'request-1', hostName: 'android-1',
    hostPlatform: 'android-capacitor', now: '2026-08-09T01:00:00Z'
  });
  saveDesktopSyncGroupWorkgroupKey(group.group_id, Buffer.alloc(32, 4).toString('base64url'));
  sqlite.exec("INSERT INTO sync_delivery_receipts VALUES ('Pixel')");
  sqlite.exec("INSERT INTO sync_peer_cursors VALUES ('Pixel')");
  recordSyncGroupDeparture({
    authorizationId: 'leave-desktop-1', authorizedByHostName: 'desktop-1', hostName: 'desktop-1',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z', local: true
  });

  expect(loadDesktopSyncGroup()).toBeNull();
  expect(loadDesktopSyncGroupWorkgroupKey(group.group_id)).toBeNull();
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE host_name = 'android-1'").get())
    .toEqual({ state: 'active' });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_delivery_receipts').get()).toEqual({ value: 0 });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_peer_cursors').get()).toEqual({ value: 0 });
  expect(sqlite.prepare("SELECT authorized_by_host_name FROM sync_group_member_departures").get())
    .toEqual({ authorized_by_host_name: 'desktop-1' });
});

it('records an active member removing another member', () => {
  const group = createDesktopSyncGroup({
    hostName: 'desktop-1', hostPlatform: 'desktop', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByHostName: 'desktop-1', authorizationId: 'request-1', hostName: 'android-1',
    hostPlatform: 'android-capacitor', now: '2026-08-09T01:00:00Z'
  });
  recordSyncGroupDeparture({
    authorizationId: 'remove-android-1', authorizedByHostName: 'desktop-1', hostName: 'android-1',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z'
  });
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE host_name = 'android-1'").get())
    .toEqual({ state: 'left' });
  expect(sqlite.prepare("SELECT authorized_by_host_name FROM sync_group_member_departures").get())
    .toEqual({ authorized_by_host_name: 'desktop-1' });
});
