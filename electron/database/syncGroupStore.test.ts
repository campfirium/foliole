import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import {
  activateSyncGroupMember,
  createDesktopSyncGroup,
  loadDesktopSyncGroup,
  registerProvisioningSyncGroupMember
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

it('keeps a joining member provisioning until its fixed cursor is proven complete', () => {
  const group = createDesktopSyncGroup({ deviceId: 'desktop-1', deviceKind: 'desktop', deviceName: 'Studio' });
  registerProvisioningSyncGroupMember({
    approvedByDeviceId: 'desktop-1', authorizationId: 'request-1', deviceId: 'android-1',
    deviceKind: 'android-capacitor', deviceName: 'Pixel', provisioningCursor: 12
  });
  expect(() => activateSyncGroupMember({
    authorizationId: 'request-1', completedCursor: 11, deviceId: 'android-1',
    groupId: group.group_id, timelineId: group.timeline_id
  })).toThrow('sync_group_member_not_authorized');
  const active = activateSyncGroupMember({
    authorizationId: 'request-1', completedCursor: 12, deviceId: 'android-1',
    groupId: group.group_id, timelineId: group.timeline_id
  });
  expect(active.members.find((member) => member.device_id === 'android-1')?.state).toBe('active');
});
