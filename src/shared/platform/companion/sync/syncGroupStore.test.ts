import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/nodeVersionRetentionSchemaStatements.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupRestoreSchemaStatements';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { PARENT_ORDER_VERSION_SCHEMA } from '../../../../../lib/core/sync/syncParentOrderVersionStore';
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
  for (const statement of PARENT_ORDER_VERSION_SCHEMA) sqlite.exec(statement);
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT)');
  sqlite.exec('CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY, version_id TEXT)');
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
      sqlite.exec('BEGIN');
      try {
        const result = await work(driver);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  database.driver = driver;
});

afterEach(() => sqlite.close());

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
  sqlite.prepare('INSERT INTO nodes VALUES (?, NULL)').run('local-note');
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
