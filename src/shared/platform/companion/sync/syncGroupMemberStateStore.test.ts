import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../../../lib/core/database/framedSyncStagingSchema';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/nodeVersionRetentionSchemaStatements';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupRestoreSchemaStatements';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, FRAMED_SYNC_TRANSFER_SEQUENCE_CAPABILITY } from '../../../../../lib/platform/syncProtocolContract';

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
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(statement);
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS) sqlite.exec(statement);
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
  await joinCompanionSyncGroup({
    mode: 'use-group', endpointUrl: 'http://provider',
    device: local, deviceName: 'iPhone', displayName: 'Studio', platform: 'ios-capacitor',
    provider: { device: provider, deviceName: 'Mac', platform: 'darwin' }, workgroupKey: 'secret'
  });
  await finishSyncGroupLocalAdoption(driver, (await loadSyncGroupLocalAdoption(driver))!);
});

afterEach(() => sqlite.close());

it.each(['missing', 'legacy'] as const)('rejects %s protocol before any companion database mutation', async kind => {
  const state = await loadCompanionSyncGroupMemberState();
  expect(state.protocol).toEqual(CURRENT_SYNC_PROTOCOL_DESCRIPTOR);
  const incoming = { ...state, sender_device_identity_key: provider.identity_key };
  if (kind === 'missing') delete incoming.protocol;
  else incoming.protocol = { ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(value => value !== FRAMED_SYNC_TRANSFER_SEQUENCE_CAPABILITY) };
  const writer = vi.spyOn(database.driver, 'run');
  await expect(applyCompanionSyncGroupMemberState(incoming, provider.identity_key))
    .rejects.toThrow('sync_group_peer_incompatible');
  expect(writer).not.toHaveBeenCalled();
  writer.mockRestore();
});

it('rejects an older proof revision from a restored provider database', async () => {
  sqlite.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES ('group-1', ?, 'peer-epoch', 7, 'pack-7', 'now')`)
    .run(provider.identity_key);
  const stale = { ...await loadCompanionSyncGroupMemberState(),
    library_epoch: 'peer-epoch', proof_revision: 100,
    source_proof_revisions: { [local.identity_key]: 6 },
    sender_device_identity_key: provider.identity_key };
  await expect(applyCompanionSyncGroupMemberState(stale, provider.identity_key))
    .rejects.toThrow('node_version_peer_restore_requires_rejoin');
});

it('merges a Windows display platform using its canonical path flavor', async () => {
  const windows = createSyncGroupDeviceIdentity({
    device_anchor: 'c3333333-3333-4333-8333-333333333333', group_id: 'group-1',
    library_path: 'd:\\c\\foliole\\data\\foliole.db', path_flavor: 'windows'
  });
  const state = await loadCompanionSyncGroupMemberState();
  await applyCompanionSyncGroupMemberState({
    ...state,
    devices: [...state.devices, {
      canonical_library_path: windows.canonical_library_path, contract_version: 1,
      device_anchor: windows.device_anchor, device_identity_key: windows.identity_key,
      device_name: 'Windows C', joined_at: '2026-09-15T02:00:00.000Z',
      last_seen_at: null, left_at: null, platform: 'Windows 11', state: 'active',
      updated_at: '2026-09-15T02:00:00.000Z'
    }],
    sender_device_identity_key: provider.identity_key
  }, provider.identity_key);
  expect((await loadCompanionSyncGroupMemberState()).devices).toContainEqual(
    expect.objectContaining({ device_identity_key: windows.identity_key, platform: 'Windows 11' })
  );
});

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
