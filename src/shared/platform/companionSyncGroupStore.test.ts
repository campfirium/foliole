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

import {
  activateCompanionSyncGroup,
  beginCompanionSyncGroupProvisioning,
  loadCompanionSyncGroup,
  mergeActiveCompanionSyncGroupMembership,
  refreshActiveCompanionSyncGroupMembership
} from './companion/sync/syncGroupStore';

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

it('persists provisioning membership and promotes it only from the desktop group payload', async () => {
  const group = {
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
    group_id: 'group-1', local_device_id: 'desktop-1', local_member_state: 'active' as const,
    members: [{
      activated_at: '2026-08-08T00:00:00.000Z', approved_by_device_id: 'desktop-1',
      authorization_id: 'founder-1', device_id: 'desktop-1', device_kind: 'darwin',
      device_name: 'Studio', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
    }, {
      activated_at: null, approved_by_device_id: 'desktop-1', authorization_id: 'request-1',
      device_id: 'android-1', device_kind: 'android-capacitor', device_name: 'Pixel',
      joined_at: '2026-08-08T00:01:00.000Z', state: 'provisioning' as const
    }],
    timeline_id: 'timeline-1'
  };
  const emptyFacts = {
    attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null
  };
  await beginCompanionSyncGroupProvisioning({
    deviceId: 'android-1', emptyFacts,
    provisioning: { group, member_authorization_id: 'request-1', provisioning_cursor: 9 }
  });
  expect(await loadCompanionSyncGroup()).toMatchObject({
    group_id: 'group-1', local_device_id: 'android-1', local_member_state: 'provisioning'
  });
  const activated = await activateCompanionSyncGroup({
    ...group, local_device_id: 'android-1', local_member_state: 'active',
    members: group.members.map((member) => member.device_id === 'android-1'
      ? { ...member, activated_at: '2026-08-08T00:02:00.000Z', state: 'active' as const }
      : member)
  });
  expect(activated.local_member_state).toBe('active');
});

it('rejects a join when persistent content already exists', async () => {
  sqlite.prepare("INSERT INTO nodes VALUES ('node-1')").run();
  await expect(beginCompanionSyncGroupProvisioning({
    deviceId: 'android-1',
    emptyFacts: { attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null },
    provisioning: { group: {} as never, member_authorization_id: 'request-1', provisioning_cursor: 0 }
  })).rejects.toThrow('sync_group_requires_empty_library');
});

it('refreshes the transport without rewriting an active member authorization fact', async () => {
  const group = {
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
    group_id: 'group-1', local_device_id: 'desktop-1', local_member_state: 'active' as const,
    members: [{
      activated_at: '2026-08-08T00:00:00.000Z', approved_by_device_id: 'desktop-1',
      authorization_id: 'founder-1', device_id: 'desktop-1', device_kind: 'darwin',
      device_name: 'Studio', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
    }, {
      activated_at: '2026-08-08T00:02:00.000Z', approved_by_device_id: 'desktop-1',
      authorization_id: 'request-1', device_id: 'android-1', device_kind: 'android-capacitor',
      device_name: 'Pixel', joined_at: '2026-08-08T00:01:00.000Z', state: 'active' as const
    }], timeline_id: 'timeline-1'
  };
  sqlite.exec(`INSERT INTO sync_groups VALUES ('group-1', 'Studio', 'timeline-1', 'desktop-1', '2026-08-08T00:00:00.000Z', '2026-08-08');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'android-1', 'active', NULL, NULL, '2026-08-08');
    INSERT INTO sync_group_members VALUES ('group-1', 'desktop-1', 'darwin', 'Studio', 'active', 'desktop-1', 'founder-1', NULL, '2026-08-08T00:00:00.000Z', '2026-08-08T00:00:00.000Z', NULL, '2026-08-08');
    INSERT INTO sync_group_members VALUES ('group-1', 'android-1', 'android-capacitor', 'Pixel', 'active', 'desktop-1', 'request-1', NULL, '2026-08-08T00:01:00.000Z', '2026-08-08T00:02:00.000Z', NULL, '2026-08-08');
    INSERT INTO nodes VALUES ('node-1')`);

  const refreshed = await refreshActiveCompanionSyncGroupMembership({ deviceId: 'android-1', group });

  expect(refreshed).toMatchObject({ local_member_state: 'active' });
  expect(refreshed.members.find((member) => member.device_id === 'android-1'))
    .toMatchObject({ authorization_id: 'request-1', state: 'active' });
});

it('merges a member fact introduced by its active approving desktop', async () => {
  const base = {
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-a', display_name: 'Studio',
    group_id: 'group-1', local_device_id: 'mobile-b', local_member_state: 'active' as const,
    members: [{
      activated_at: '2026-08-08T00:00:00.000Z', approved_by_device_id: 'desktop-a',
      authorization_id: 'founder-a', device_id: 'desktop-a', device_kind: 'darwin',
      device_name: 'Studio', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
    }, {
      activated_at: '2026-08-08T00:02:00.000Z', approved_by_device_id: 'desktop-a',
      authorization_id: 'authorization-b', device_id: 'mobile-b', device_kind: 'android-capacitor',
      device_name: 'A5', joined_at: '2026-08-08T00:01:00.000Z', state: 'active' as const
    }], timeline_id: 'timeline-1'
  };
  sqlite.exec("INSERT INTO sync_groups VALUES ('group-1', 'Studio', 'timeline-1', 'desktop-a', '2026-08-08T00:00:00.000Z', '2026-08-08'); INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'mobile-b', 'active', NULL, NULL, '2026-08-08')");
  for (const member of base.members) {
    sqlite.prepare(`INSERT INTO sync_group_members VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, '2026-08-08')`).run(
      base.group_id, member.device_id, member.device_kind, member.device_name, member.state,
      member.approved_by_device_id, member.authorization_id, member.joined_at, member.activated_at
    );
  }
  const c = {
    activated_at: '2026-08-08T00:04:00.000Z', approved_by_device_id: 'desktop-a',
    authorization_id: 'authorization-c', device_id: 'desktop-c', device_kind: 'win32',
    device_name: 'Windows', joined_at: '2026-08-08T00:03:00.000Z', state: 'active' as const
  };
  const merged = await mergeActiveCompanionSyncGroupMembership({
    ...base, local_device_id: 'desktop-a', members: [...base.members, c]
  });
  expect(merged.members.find((member) => member.device_id === 'desktop-c')).toEqual(c);
});
