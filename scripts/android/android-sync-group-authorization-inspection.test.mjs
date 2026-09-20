// @vitest-environment node

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.ts';
import { inspectLocalActiveDeviceIdentityFingerprint } from './android-sync-group-authorization-inspection.mjs';
import { pairSyncRecoveryReadiness } from './android-pair-sync-recovery-readiness.mjs';
import { hasProtectedPendingSyncState } from './macos-a5-pending-sync-state.mjs';

const databases = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function database() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  SYNC_GROUP_SCHEMA_STATEMENTS.forEach((sql) => db.exec(sql));
  db.exec(`INSERT INTO sync_groups VALUES ('group-a', 'Test', 'test-key', '1', '1');
    INSERT INTO sync_group_devices VALUES
      ('group-a', 'device-a5', 'anchor-a5', 'library', 'A5', 'android', 'active', '1', NULL, '1', '1'),
      ('group-a', 'device-mac', 'anchor-mac', 'library', 'Mac', 'macos', 'active', '1', NULL, '1', '1');
    INSERT INTO sync_group_local_state VALUES (1, 'group-a', 'device-a5', 'active', '1');`);
  return db;
}

function readiness(db, overrides = {}) {
  const inspection = {
    syncGroupId: 'group-a', activeSyncGroupMemberCount: 2, nodeCount: 19,
    dirtyRecordCount: 3, dirtyObjectCounts: { node_open_state: 3 },
    localDeviceIdentityFingerprint: inspectLocalActiveDeviceIdentityFingerprint(db),
    ...overrides
  };
  return pairSyncRecoveryReadiness({ database: { exists: true, inspection },
    packageInfo: { installed: true } }, false, null, false, null, true);
}

it('recognizes the current schema binding without exposing device identity or group key', () => {
  const db = database();
  expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sync_group_members'").get())
    .toBeUndefined();
  const result = readiness(db);
  expect(result.localDeviceIdentityFingerprint).toBe(
    createHash('sha256').update('device-a5').digest('hex').slice(0, 16)
  );
  expect(JSON.stringify(result)).not.toContain('device-a5');
  expect(JSON.stringify(result)).not.toContain('test-key');
  expect(result.localMemberAuthorizationFingerprint).toBeNull();
  expect(result.missingPrerequisites).toEqual(['unsynced_device_data_requires_review']);
  expect(result.resultStatus).toBe('approval_required');
  expect(hasProtectedPendingSyncState(result)).toBe(false);
});

it.each([
  'DELETE FROM sync_group_local_state',
  "UPDATE sync_group_local_state SET local_device_identity_key = 'unknown'",
  "UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = 'device-a5'",
  "INSERT INTO sync_groups VALUES ('other', 'Other', 'key', '1', '1'); UPDATE sync_group_devices SET group_id = 'other' WHERE device_identity_key = 'device-a5'",
  'DELETE FROM sync_groups',
  "UPDATE sync_group_local_state SET local_device_identity_key = ''; UPDATE sync_group_devices SET device_identity_key = '' WHERE device_identity_key = 'device-a5'"
])('fails closed for an unproven local binding: %s', (sql) => {
  const db = database();
  db.exec(sql);
  expect(inspectLocalActiveDeviceIdentityFingerprint(db)).toBeNull();
  expect(readiness(db).missingPrerequisites).toEqual([
    'local_authorization_missing', 'unsynced_device_data_requires_review'
  ]);
});

it('rejects a retained group with no active devices and ignores legacy authorization claims', () => {
  const db = database();
  db.exec("UPDATE sync_group_devices SET state = 'left'");
  expect(readiness(db, { activeSyncGroupMemberCount: 0,
    localMemberAuthorizationFingerprint: '0123456789abcdef' }).missingPrerequisites)
    .toContain('local_authorization_missing');
});

it('does not read retired member authorization as a current device binding', () => {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(`CREATE TABLE sync_groups (group_id TEXT);
    CREATE TABLE sync_group_local_state (singleton_id INTEGER, group_id TEXT,
      local_host_name TEXT, member_state TEXT);
    CREATE TABLE sync_group_members (group_id TEXT, host_name TEXT, authorization_id TEXT, state TEXT);
    INSERT INTO sync_group_local_state VALUES (1, 'group-a', 'A5', 'active');
    INSERT INTO sync_group_members VALUES ('group-a', 'A5', 'old-authorization', 'active');`);
  expect(inspectLocalActiveDeviceIdentityFingerprint(db)).toBeNull();
});

it('allows a clean workspace only after a valid current binding and group authority', () => {
  expect(readiness(database(), { dirtyRecordCount: 0, dirtyObjectCounts: {} }))
    .toMatchObject({ resultStatus: 'ready', missingPrerequisites: [] });
});
