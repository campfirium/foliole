// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { inspectDepartedHistory } from './android-departed-history-inspection.mjs';
import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE sync_groups (group_id TEXT PRIMARY KEY, workgroup_key TEXT);
    CREATE TABLE sync_group_members (group_id TEXT, host_name TEXT, state TEXT,
      authorization_id TEXT, left_at TEXT);
    CREATE TABLE sync_group_member_departures (group_id TEXT, host_name TEXT,
      authorized_by_host_name TEXT, authorization_id TEXT, left_at TEXT);
    CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, group_id TEXT,
      local_host_name TEXT, member_state TEXT);
    INSERT INTO companion_meta VALUES ('device_id', 'device-a5');
    INSERT INTO companion_meta VALUES ('host_name', 'host-a5');
    INSERT INTO companion_meta VALUES ('workspace_sync_endpoint_url', 'http://desktop.invalid');
    INSERT INTO sync_groups VALUES ('group-1', 'workgroup-key');
    INSERT INTO sync_group_members VALUES
      ('group-1', 'host-a5', 'active', 'authorization-a5', NULL),
      ('group-1', 'host-desktop', 'active', 'authorization-desktop', NULL),
      ('group-1', 'host-offline', 'active', 'authorization-offline', NULL);
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'host-a5', 'active');`);
  return db;
}

it('separates current participation from retained group history after product Leave', () => {
  const db = database();
  expect(inspectDepartedHistory(db)).toMatchObject({
    activeSyncGroupMemberCount: 3, storedSyncGroupMemberCount: 3,
    syncGroupId: 'group-1', workspaceSyncEndpointPresent: true
  });
  db.exec(`DELETE FROM sync_group_local_state;
    UPDATE sync_groups SET workgroup_key = NULL;
    UPDATE sync_group_members SET state = 'left', left_at = '2026-08-20T00:00:00.000Z'
      WHERE host_name = 'host-a5';
    INSERT INTO sync_group_member_departures VALUES
      ('group-1', 'host-a5', 'host-a5', 'leave-a5', '2026-08-20T00:00:00.000Z');`);

  const evidence = inspectDepartedHistory(db);
  expect(evidence).toMatchObject({
    activeSyncGroupMemberCount: 0,
    storedLocalDepartureAuthorizationFingerprint: authorizationFingerprint('leave-a5'),
    storedLocalDepartureMatchCount: 1,
    storedLocalMemberAuthorizationFingerprint: authorizationFingerprint('authorization-a5'),
    storedSyncGroupCount: 1, storedSyncGroupDepartureCount: 1,
    storedSyncGroupId: 'group-1', storedSyncGroupMemberCount: 3,
    storedSyncGroupTimelineId: null, syncGroupId: null,
    syncGroupTimelineId: null, workspaceSyncEndpointPresent: true
  });
  expect(JSON.stringify(evidence)).not.toContain('authorization-a5');
  expect(JSON.stringify(evidence)).not.toContain('leave-a5');
  expect(JSON.stringify(evidence)).not.toContain('host-a5');
  db.close();
});

it('does not choose a stored history when more than one group exists', () => {
  const db = database();
  db.exec("INSERT INTO sync_groups VALUES ('group-2', NULL)");
  expect(inspectDepartedHistory(db)).toMatchObject({
    storedLocalDepartureMatchCount: 0, storedSyncGroupCount: 2,
    storedSyncGroupId: null, storedSyncGroupTimelineId: null
  });
  db.close();
});
