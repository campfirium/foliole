import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
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
  expect(group.members.find((member) => member.device_id === 'android-1')).toMatchObject({
    approved_by_device_id: 'desktop-1', state: 'active'
  });
});

it('replaces a departed device with its newly approved membership generation', () => {
  const group = createDesktopSyncGroup({
    deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio', now: '2026-08-09T00:00:00Z'
  });
  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-old', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T01:00:00Z'
  });
  recordSyncGroupDeparture({
    authorizationId: 'leave-android-1', authorizedByDeviceId: 'android-1', deviceId: 'android-1',
    groupId: group.group_id, leftAt: '2026-08-09T02:00:00Z'
  });

  registerSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-new', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', now: '2026-08-09T03:00:00Z'
  });

  expect(sqlite.prepare(`SELECT state, authorization_id, joined_at, left_at
    FROM sync_group_members WHERE device_id = 'android-1'`).get()).toEqual({
    authorization_id: 'request-new', joined_at: '2026-08-09T03:00:00Z', left_at: null, state: 'active'
  });
  expect(sqlite.prepare(`SELECT COUNT(*) AS value FROM sync_group_member_departures
    WHERE device_id = 'android-1'`).get()).toEqual({ value: 0 });
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
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE device_id = 'android-1'").get())
    .toEqual({ state: 'active' });
  expect(sqlite.prepare("SELECT authorized_by_device_id FROM sync_group_member_departures").get())
    .toEqual({ authorized_by_device_id: 'desktop-1' });
});
