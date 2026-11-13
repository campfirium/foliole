import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/nodeVersionRetentionSchemaStatements.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupRestoreSchemaStatements';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import type { SyncGroupJoinMode } from '../../../../../lib/platform/syncGroupJoinMode';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';

const database = vi.hoisted(() => ({ driver: null as unknown as DbPort }));

vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: <T>(task: (driver: typeof database.driver) => T) => task(database.driver),
    runWriter: <T>(task: (driver: typeof database.driver) => T) => task(database.driver)
  })
}));

import {
  hydrateCompanionSyncGroupAdoptionRun, leaveCompanionSyncGroupAfterAdoptionStops,
  readCompanionSyncGroupAdoptionRun
} from './companionSyncGroupAdoptionRun';
import {
  joinCompanionSyncGroup, leaveCompanionSyncGroupDevice, loadCompanionSyncGroup
} from './syncGroupStore';

let sqlite: Database.Database;

const local = createSyncGroupDeviceIdentity({
  device_anchor: 'a1111111-1111-4111-8111-111111111111', group_id: 'group-1',
  library_path: '/mobile/foliole.db', path_flavor: 'posix'
});
const provider = createSyncGroupDeviceIdentity({
  device_anchor: 'b2222222-2222-4222-8222-222222222222', group_id: 'group-1',
  library_path: '/desktop/foliole.db', path_flavor: 'posix'
});
const join = (mode: SyncGroupJoinMode = 'use-group') => joinCompanionSyncGroup({
  mode, endpointUrl: 'http://provider',
  device: local, deviceName: 'iPhone', displayName: 'Maci Sync Group', platform: 'ios-capacitor',
  provider: { device: provider, deviceName: 'Maci', platform: 'darwin' }, workgroupKey: 'secret'
});

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of NODE_VERSION_RETENTION_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('CREATE TABLE sync_delivery_receipts (peer_id TEXT)');
  sqlite.exec('CREATE TABLE sync_peer_cursors (peer_id TEXT)');
  const driver: DbPort = {
    query: async <T extends DbRow>(sql: string, params: DbParams = []) =>
      sqlite.prepare(sql).all(...params) as T[],
    run: async (sql: string, params: DbParams = []) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    transaction: async <T>(work: (tx: DbPort) => Promise<T>) => {
      sqlite.exec('SAVEPOINT test_transaction');
      try {
        const result = await work(driver);
        sqlite.exec('RELEASE test_transaction');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK TO test_transaction');
        sqlite.exec('RELEASE test_transaction');
        throw error;
      }
    }
  };
  database.driver = driver;
});

afterEach(() => sqlite.close());

it('persists departure without reclaiming stored topic history', async () => {
  await join('overwrite');
  sqlite.exec(`
    INSERT INTO nodes (id, title, content, current_version_id, created_at, updated_at)
    VALUES ('topic', 'Topic', 'Current text', 'head', 'now', 'now');
    INSERT INTO node_sync_versions (version_id, object_id, parent_version_id, host_name,
      created_at, content_hash, body_text, snapshot_json)
    VALUES ('base', 'topic', NULL, 'mobile', 'now', 'base-hash', 'Original text', '{"id":"topic"}'),
      ('head', 'topic', 'base', 'mobile', 'now', 'head-hash', 'Current text', '{"id":"topic"}');
    INSERT INTO node_sync_version_parents VALUES ('head', 'base', 0);
  `);

  await leaveCompanionSyncGroupAfterAdoptionStops();

  expect(await loadCompanionSyncGroup()).toBeNull();
  expect(sqlite.prepare('SELECT state FROM sync_group_devices WHERE device_identity_key = ?')
    .pluck().get(local.identity_key)).toBe('left');
  expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Current text');
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .pluck().get('base')).toBe('Original text');
});

it('reactivates the same Device when it rejoins a retained Sync Group', async () => {
  await join();
  await leaveCompanionSyncGroupDevice();
  expect(await loadCompanionSyncGroup()).toBeNull();

  const group = await join();

  expect(group.local_device_identity_key).toBe(local.identity_key);
  expect(group.devices).toEqual(expect.arrayContaining([
    expect.objectContaining({ device_identity_key: local.identity_key, state: 'active' }),
    expect.objectContaining({ device_identity_key: provider.identity_key, state: 'active' })
  ]));
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_groups').pluck().get()).toBe(1);
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_group_devices').pluck().get()).toBe(2);
});


it('publishes an applied whole-group overwrite together with mobile membership', async () => {
  sqlite.prepare("INSERT INTO nodes (id, title, created_at, updated_at) VALUES (?, ?, 'now', 'now')")
    .run('local-note', 'Local note');
  const group = await join('overwrite');
  const event = sqlite.prepare('SELECT * FROM sync_group_restore_events').get() as {
    group_id: string; restore_id: string; applied_at: string; source_device_identity_key: string
  };
  expect(event).toMatchObject({ group_id: group.group_id, source_device_identity_key: local.identity_key });
  expect(event.applied_at).toBeTruthy();
  expect(sqlite.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get()).toBe(event.restore_id);
  expect(sqlite.prepare('SELECT id FROM nodes').pluck().get()).toBe('local-note');
});

it('does not publish a group overwrite while preparing local replacement', async () => {
  await join('use-group');
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_group_restore_events').pluck().get()).toBe(0);
});

it('rolls membership back if publishing the chosen overwrite fails', async () => {
  sqlite.exec("CREATE TRIGGER reject_restore BEFORE INSERT ON sync_group_restore_events BEGIN SELECT RAISE(ABORT, 'failed publication'); END");
  await expect(join('overwrite')).rejects.toThrow('failed publication');
  expect(await loadCompanionSyncGroup()).toBeNull();
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_groups').pluck().get()).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_group_restore_events').pluck().get()).toBe(0);
});

it('leaves a pending first reception without deleting local nodes', async () => {
  sqlite.exec(`INSERT INTO nodes (id, title, created_at, updated_at)
    VALUES ('special-inbox', 'Inbox', 'now', 'now'), ('local-note', 'Local note', 'now', 'now')`);
  await join();
  expect(await loadSyncGroupLocalAdoption(database.driver)).not.toBeNull();

  await leaveCompanionSyncGroupDevice();

  expect(await loadCompanionSyncGroup()).toBeNull();
  expect(await loadSyncGroupLocalAdoption(database.driver)).toBeNull();
  expect(sqlite.prepare('SELECT id FROM nodes ORDER BY id').pluck().all())
    .toEqual(['local-note', 'special-inbox']);
});

it('discards pending reception when the local membership has already been cleared', async () => {
  await join();
  sqlite.exec('DELETE FROM sync_group_local_state');
  expect(await hydrateCompanionSyncGroupAdoptionRun()).toBe(true);

  await leaveCompanionSyncGroupAfterAdoptionStops();

  expect(readCompanionSyncGroupAdoptionRun()).toEqual({ phase: 'none' });
  expect(await hydrateCompanionSyncGroupAdoptionRun()).toBe(false);
});
