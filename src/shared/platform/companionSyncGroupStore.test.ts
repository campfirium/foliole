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

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
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
  const group = {
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
    group_id: 'group-1', local_device_id: 'desktop-1', local_member_state: 'active' as const,
    members: [{
      approved_by_device_id: 'desktop-1',
      authorization_id: 'founder-1', device_id: 'desktop-1', device_kind: 'darwin',
      device_name: 'Studio', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
    }, {
      approved_by_device_id: 'desktop-1', authorization_id: 'request-1',
      device_id: 'android-1', device_kind: 'android-capacitor', device_name: 'Pixel',
      joined_at: '2026-08-08T00:01:00.000Z', state: 'active' as const
    }],
    timeline_id: 'timeline-1'
  };
  const emptyFacts = {
    attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null
  };
  await joinCompanionSyncGroup({ deviceId: 'android-1', emptyFacts, group });
  expect(await loadCompanionSyncGroup()).toMatchObject({
    group_id: 'group-1', local_device_id: 'android-1', local_member_state: 'active'
  });
});

it('rejects a join when persistent content already exists', async () => {
  sqlite.prepare("INSERT INTO nodes VALUES ('node-1')").run();
  await expect(joinCompanionSyncGroup({
    deviceId: 'android-1',
    emptyFacts: { attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null },
    group: {} as never
  })).rejects.toThrow('sync_group_requires_empty_library');
});

it('refreshes authorization for the same active member without requiring an empty library', async () => {
  const group = {
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
    group_id: 'group-1', local_device_id: 'android-1', local_member_state: 'active' as const,
    members: [{
      approved_by_device_id: 'desktop-1',
      authorization_id: 'request-2', device_id: 'android-1', device_kind: 'android-capacitor',
      device_name: 'Pixel', joined_at: '2026-08-08T00:01:00.000Z', state: 'active' as const
    }], timeline_id: 'timeline-1'
  };
  sqlite.exec(`INSERT INTO sync_groups VALUES ('group-1', 'Studio', 'timeline-1', 'desktop-1', '2026-08-08', '2026-08-08');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'android-1', 'active', NULL, NULL, '2026-08-08');
    INSERT INTO nodes VALUES ('node-1')`);

  const refreshed = await refreshActiveCompanionSyncGroupMembership({ deviceId: 'android-1', group });

  expect(refreshed).toMatchObject({ local_member_state: 'active' });
  expect(refreshed.members[0]).toMatchObject({ authorization_id: 'request-2', state: 'active' });
});
