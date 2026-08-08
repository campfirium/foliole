import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { mergeDesktopSyncGroupMembership } from './syncGroupMembershipStore.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup, registerProvisioningSyncGroupMember } from './syncGroupStore.js';

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

it('merges a directly approved C fact submitted by active B', () => {
  createDesktopSyncGroup({
    deviceId: 'desktop-a', deviceKind: 'darwin', deviceName: 'Studio', now: '2026-08-08T00:00:00.000Z'
  });
  registerProvisioningSyncGroupMember({
    approvedByDeviceId: 'desktop-a', authorizationId: 'authorization-b', deviceId: 'mobile-b',
    deviceKind: 'android-capacitor', deviceName: 'A5', provisioningCursor: 0,
    now: '2026-08-08T00:01:00.000Z'
  });
  sqlite.prepare("UPDATE sync_group_members SET state = 'active', activated_at = '2026-08-08T00:02:00.000Z' WHERE device_id = 'mobile-b'").run();
  const current = loadDesktopSyncGroup()!;
  const merged = mergeDesktopSyncGroupMembership({
    incomingGroup: {
      ...current, local_device_id: 'mobile-b',
      members: [...current.members, {
        activated_at: '2026-08-08T00:04:00.000Z', approved_by_device_id: 'mobile-b',
        authorization_id: 'authorization-c', device_id: 'desktop-c', device_kind: 'win32',
        device_name: 'Windows', joined_at: '2026-08-08T00:03:00.000Z', state: 'active'
      }]
    },
    now: '2026-08-08T00:05:00.000Z', submittedByDeviceId: 'mobile-b'
  });
  expect(merged.members.map((member) => member.device_id)).toEqual(['desktop-a', 'mobile-b', 'desktop-c']);
});

it('rejects a different timeline and a payload claiming another local submitter', () => {
  const group = createDesktopSyncGroup({ deviceId: 'desktop-a', deviceKind: 'darwin', deviceName: 'Studio' });
  expect(() => mergeDesktopSyncGroupMembership({
    incomingGroup: { ...group, timeline_id: 'timeline-forged' }, submittedByDeviceId: 'desktop-a'
  })).toThrow('sync_group_identity_mismatch');
  expect(() => mergeDesktopSyncGroupMembership({
    incomingGroup: { ...group, local_device_id: 'mobile-b' }, submittedByDeviceId: 'desktop-a'
  })).toThrow('sync_group_submitter_identity_mismatch');
});
