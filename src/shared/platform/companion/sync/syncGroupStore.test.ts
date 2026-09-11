import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
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
const join = () => joinCompanionSyncGroup({
  device: local, deviceName: 'iPhone', displayName: 'Maci Sync Group', platform: 'ios-capacitor',
  provider: { device: provider, deviceName: 'Maci', platform: 'darwin' }, workgroupKey: 'secret'
});

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
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
