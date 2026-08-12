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

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('CREATE TABLE sync_object_state (state_seq INTEGER)');
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
    approvedByDeviceId: 'Maci', authorizationId: 'request-2', deviceId: 'Maci',
    deviceKind: 'darwin', deviceName: 'Maci', now: '2026-08-09T01:00:00Z'
  });
  const repeated = registerSyncGroupMember({
    approvedByDeviceId: 'Maci', authorizationId: 'request-2', deviceId: 'Maci',
    deviceKind: 'darwin', deviceName: 'Maci', now: '2026-08-09T02:00:00Z'
  });
  expect(second.members.map((member) => member.device_name).sort()).toEqual(['Maci', 'Maci 2']);
  expect(repeated.members).toEqual(second.members);
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

it('retains a departed profile and assigns the next readable identity when it rejoins', () => {
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
    authorization_id: 'request-new', device_id: 'Pixel 2', device_name: 'Pixel 2',
    joined_at: '2026-08-09T03:00:00Z', left_at: null, state: 'active'
  });
  expect(sqlite.prepare(`SELECT COUNT(*) AS value FROM sync_group_member_departures
    WHERE device_id = 'Pixel'`).get()).toEqual({ value: 1 });
});

it('records a self-authorized departure and unbinds only the local departing Device', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-1', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T01:00:00Z'
  });
  recordSyncGroupDeparture({
    authorizationId: 'leave-desktop-1', authorizedByDeviceId: 'desktop-1', deviceId: 'desktop-1',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z', local: true
  });

  expect(loadDesktopSyncGroup()).toBeNull();
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE device_id = 'Pixel'").get())
    .toEqual({ state: 'active' });
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
