import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';

const database = vi.hoisted(() => ({ driver: null as unknown as DbPort }));

vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: <T>(task: (driver: DbPort) => T) => task(database.driver),
    runWriter: <T>(task: (driver: DbPort) => T) => task(database.driver)
  })
}));

import {
  applyCompanionSyncGroupMemberState,
  loadCompanionSyncGroupMemberState
} from './syncGroupMemberStateStore';
import { joinCompanionSyncGroup, loadCompanionSyncGroup } from './syncGroupStore';

let sqlite: Database.Database;
const local = createSyncGroupDeviceIdentity({
  device_anchor: 'a1111111-1111-4111-8111-111111111111', group_id: 'group-1',
  library_path: '/mobile/foliole.db', path_flavor: 'posix'
});
const provider = createSyncGroupDeviceIdentity({
  device_anchor: 'b2222222-2222-4222-8222-222222222222', group_id: 'group-1',
  library_path: '/desktop/foliole.db', path_flavor: 'posix'
});

beforeEach(async () => {
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
  await joinCompanionSyncGroup({
    device: local, deviceName: 'iPhone', displayName: 'Studio', platform: 'ios-capacitor',
    provider: { device: provider, deviceName: 'Mac', platform: 'darwin' }, workgroupKey: 'secret'
  });
});

afterEach(() => sqlite.close());

it('persists a target exit and returns its confirmation before the provider stops', async () => {
  const state = await loadCompanionSyncGroupMemberState();
  const result = await applyCompanionSyncGroupMemberState({
    ...state,
    removals: [{
      completed_at: null,
      confirmations: [{
        confirmed_at: '2026-09-15T02:00:00.000Z',
        confirming_device_identity_key: provider.identity_key,
        kind: 'enforced'
      }],
      created_at: '2026-09-15T02:00:00.000Z',
      decision_id: 'removal-1',
      initiated_by_device_identity_key: provider.identity_key,
      superseded_at: null,
      target_device_identity_key: local.identity_key
    }],
    sender_device_identity_key: provider.identity_key
  }, provider.identity_key);

  expect(result.local_exited).toBe(true);
  expect(result.state.removals[0]?.confirmations).toContainEqual(expect.objectContaining({
    confirming_device_identity_key: local.identity_key, kind: 'target_exit'
  }));
  expect(await loadCompanionSyncGroup()).toBeNull();
});
