import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../lib/core/database/syncGroupSchemaStatements.js';
import type { DbPort } from '../../../lib/core/sync/dbPort.js';

const databaseOwner = vi.hoisted(() => ({ current: null as unknown as {
  read<T>(task: (db: DbPort) => Promise<T>): Promise<T>;
  runWriter<T>(task: (db: DbPort) => Promise<T>): Promise<T>;
} }));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => databaseOwner.current
}));

import { joinCompanionSyncGroup, loadCompanionSyncGroup,
  refreshActiveCompanionSyncGroupMembership } from './companion/sync/syncGroupStore';

let sqlite: Database.Database;

const group = {
  created_at: '2026-08-08T00:00:00.000Z', created_by_host_name: 'desktop-1', display_name: 'Studio',
  group_id: 'group-1', local_host_name: 'desktop-1', local_member_state: 'active' as const,
  members: [{
    approved_by_host_name: 'desktop-1',
    authorization_id: 'founder-1', host_name: 'desktop-1', host_platform: 'darwin',
    joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
  }, {
    approved_by_host_name: 'desktop-1', authorization_id: 'request-1',
    host_name: 'android-1', host_platform: 'android-capacitor',
    joined_at: '2026-08-08T00:01:00.000Z', state: 'active' as const
  }],
  timeline_id: 'timeline-1'
};

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  for (const table of ['attachments', 'content_blobs', 'nodes', 'review_log']) {
    sqlite.exec(`CREATE TABLE ${table} (id TEXT)`);
  }
  const port = createBetterSqliteDbPort(sqlite, { name: 'sync-group-mobile-test' });
  databaseOwner.current = {
    read: (task) => task(port),
    runWriter: (task) => task(port)
  };
});

afterEach(() => sqlite.close());

it('persists membership immediately when the approved group payload is accepted', async () => {
  await joinCompanionSyncGroup({ hostName: 'android-1', group, workgroupKey: 'group-key' });
  expect(await loadCompanionSyncGroup()).toMatchObject({
    group_id: 'group-1', local_host_name: 'android-1', local_member_state: 'active'
  });
  expect(sqlite.prepare("SELECT value FROM companion_meta WHERE key = 'host_name'").pluck().get())
    .toBe('android-1');
});

it('joins without deleting persistent content that already exists', async () => {
  sqlite.prepare("INSERT INTO nodes VALUES ('node-1')").run();
  await joinCompanionSyncGroup({ hostName: 'android-1', group, workgroupKey: 'group-key' });
  expect(sqlite.prepare('SELECT id FROM nodes').all()).toEqual([{ id: 'node-1' }]);
  expect(await loadCompanionSyncGroup()).toMatchObject({ group_id: 'group-1', local_member_state: 'active' });
});

it('rejects replacing an existing local Sync Group identity', async () => {
  sqlite.exec(`INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at)
    VALUES ('group-old', 'Old', 'timeline-old', 'desktop-old', '2026-08-08', '2026-08-08');
    INSERT INTO sync_group_local_state VALUES (1, 'group-old', 'android-1', 'active', NULL, NULL, '2026-08-08')`);
  await expect(joinCompanionSyncGroup({ hostName: 'android-1', group, workgroupKey: 'group-key' }))
    .rejects.toThrow('sync_group_identity_mismatch');
});

it('refreshes authorization for the same active member without requiring an empty library', async () => {
  const group = {
    created_at: '2026-08-08T00:00:00.000Z', created_by_host_name: 'desktop-1', display_name: 'Studio',
    group_id: 'group-1', local_host_name: 'android-1', local_member_state: 'active' as const,
    members: [{
      approved_by_host_name: 'desktop-1',
      authorization_id: 'request-2', host_name: 'android-1', host_platform: 'android-capacitor',
      joined_at: '2026-08-08T00:01:00.000Z', state: 'active' as const
    }], timeline_id: 'timeline-1'
  };
  sqlite.exec(`INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at)
    VALUES ('group-1', 'Studio', 'timeline-1', 'desktop-1', '2026-08-08', '2026-08-08');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'android-1', 'active', NULL, NULL, '2026-08-08');
    INSERT INTO nodes VALUES ('node-1')`);

  const refreshed = await refreshActiveCompanionSyncGroupMembership({
    hostName: 'android-1', group, workgroupKey: 'group-key'
  });

  expect(refreshed).toMatchObject({ local_member_state: 'active' });
  expect(refreshed.members[0]).toMatchObject({ authorization_id: 'request-2', state: 'active' });
});
