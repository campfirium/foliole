import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/desktopSourceSchemaStatements';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../../../lib/core/database/framedSyncStagingSchema';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/nodeVersionRetentionSchemaStatements';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupRestoreSchemaStatements';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/syncGroupSchemaStatements';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';

const database = vi.hoisted(() => ({ driver: null as unknown as DbPort }));

vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: <T>(task: (driver: DbPort) => T) => task(database.driver),
    runWriter: <T>(task: (driver: DbPort) => T) => task(database.driver)
  })
}));

import { loadRemovals } from './syncGroupMemberStateReads';
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
  for (const statement of [...FRAMED_SYNC_STAGING_SCHEMA, ...DESKTOP_SOURCE_SCHEMA_STATEMENTS]) sqlite.exec(statement);
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

it('loads removal confirmations with bounded bridge reads and preserves decision ordering', async () => {
  const insert = sqlite.prepare(`INSERT INTO sync_group_removal_decisions
    (group_id, decision_id, target_device_identity_key, initiated_by_device_identity_key, created_at)
    VALUES ('group-1', ?, 'target', 'initiator', ?)`);
  for (const id of ['c', 'b', 'a']) insert.run(id, id === 'c' ? '2026-01-02' : '2026-01-01');
  const confirm = sqlite.prepare(`INSERT INTO sync_group_removal_confirmations
    (group_id, decision_id, confirming_device_identity_key, kind, confirmed_at)
    VALUES ('group-1', ?, ?, ?, '2026-01-03')`);
  confirm.run('a', 'z', 'target_exit');
  confirm.run('a', 'b', 'enforced');
  confirm.run('c', 'b', 'enforced');
  sqlite.exec(`INSERT INTO sync_groups VALUES ('other', 'Other', 'secret', '2026-01-01', '2026-01-01');
    INSERT INTO sync_group_removal_decisions VALUES
      ('other', 'a', 'foreign-target', 'initiator', '2026-01-01', NULL, NULL);
    INSERT INTO sync_group_removal_confirmations VALUES
      ('other', 'a', 'foreign-member', 'enforced', '2026-01-03')`);
  const query = vi.spyOn(database.driver, 'query');
  try {
    const rows = await loadRemovals(database.driver, 'group-1');
    expect(rows.map(row => [row.decision_id, row.confirmations])).toEqual([
      ['a', [
        { confirming_device_identity_key: 'b', kind: 'enforced', confirmed_at: '2026-01-03' },
        { confirming_device_identity_key: 'z', kind: 'target_exit', confirmed_at: '2026-01-03' }
      ]],
      ['b', []],
      ['c', [{ confirming_device_identity_key: 'b', kind: 'enforced', confirmed_at: '2026-01-03' }]]
    ]);
    expect(query.mock.calls.length).toBeLessThanOrEqual(2);
    expect(await loadRemovals(database.driver, 'another-group')).toEqual([]);
  } finally { query.mockRestore(); }
});

it.each(['missing', 'legacy'] as const)('rejects %s protocol before any companion database mutation', async kind => {
  const state = await loadCompanionSyncGroupMemberState();
  expect(state.protocol).toEqual(CURRENT_SYNC_PROTOCOL_DESCRIPTOR);
  const incoming = { ...state, sender_device_identity_key: provider.identity_key };
  if (kind === 'missing') delete incoming.protocol;
  else incoming.protocol = { ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(value => value !== 'framed-sync-v28') };
  const writer = vi.spyOn(database.driver, 'run');
  await expect(applyCompanionSyncGroupMemberState(incoming, provider.identity_key))
    .rejects.toThrow('sync_group_peer_incompatible');
  expect(writer).not.toHaveBeenCalled();
  writer.mockRestore();
});

it('rejects a restored provider copy but keeps syncing when it only lost its last commits', async () => {
  sqlite.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES ('group-1', ?, 'peer-epoch', 7, 'pack-7', 'now')`)
    .run(provider.identity_key);
  // This device already counts on the provider owning its changes; the restored copy cannot show it does.
  sqlite.prepare("INSERT INTO sync_group_metadata (key, value, updated_at) VALUES ('sync_group_coverage:group-1', ?, 'now')")
    .run(JSON.stringify({ basis: '', cells: { [provider.identity_key]: { [local.identity_key]: '2026-10-21T05:37:00.000Z' } } }));
  const stale = { ...await loadCompanionSyncGroupMemberState(),
    library_epoch: 'peer-epoch', proof_revision: 100,
    source_proof_revisions: { [local.identity_key]: 6 },
    sender_device_identity_key: provider.identity_key };
  delete stale.coverage;
  await expect(applyCompanionSyncGroupMemberState(stale, provider.identity_key))
    .rejects.toThrow('node_version_peer_restore_requires_rejoin');
  const crashed = { ...stale, coverage: { basis: '', cells: {
    [provider.identity_key]: { [local.identity_key]: '2026-10-21T05:20:00.000Z' } } } };
  await expect(applyCompanionSyncGroupMemberState(crashed, provider.identity_key)).resolves.toBeDefined();
  expect(sqlite.prepare('SELECT proof_revision FROM node_version_device_revisions WHERE device_identity_key = ?')
    .pluck().get(provider.identity_key)).toBe(6);
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

it.each([null, '2026-09-15T02:00:01.000Z'])('persists target exit even when the received decision is completed at %s', async completedAt => {
  const state = await loadCompanionSyncGroupMemberState();
  const result = await applyCompanionSyncGroupMemberState({
    ...state,
    removals: [{
      completed_at: completedAt,
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

it('receives source members needed by a pending restore without opening ordinary synchronization', async () => {
  const state = await loadCompanionSyncGroupMemberState();
  const event = { group_id: 'group-1', restore_id: 'restore-1', restored_at: '2026-10-10T00:00:00.000Z',
    source_device_identity_key: provider.identity_key };
  sqlite.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)`).run(event.restore_id, event.group_id, event.restored_at,
    event.source_device_identity_key, event.restored_at);
  const windows = createSyncGroupDeviceIdentity({ device_anchor: 'c3333333-3333-4333-8333-333333333333',
    group_id: 'group-1', library_path: 'd:\\c\\foliole\\data\\foliole.db', path_flavor: 'windows' });
  const result = await applyCompanionSyncGroupMemberState({ ...state, restore: { event, applied: true },
    devices: [...state.devices, { ...state.devices[0]!, device_anchor: windows.device_anchor,
      canonical_library_path: windows.canonical_library_path, device_identity_key: windows.identity_key,
      device_name: 'Windows', platform: 'Windows' }], sender_device_identity_key: provider.identity_key }, provider.identity_key);
  expect(result.normal_sync_ready).toBe(false);
  expect(result.local_exited).toBe(false);
  expect(result.state.restore).toEqual({ event, applied: false });
  expect(result.state.devices).toContainEqual(expect.objectContaining({ device_identity_key: windows.identity_key }));
});

it('finishes on a receiving companion while excluding another pending target and retaining per-decision confirmations', async () => {
  const state = await loadCompanionSyncGroupMemberState();
  const extra = { ...state.devices[0]!, device_identity_key: 'unused' };
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: 'c3333333-3333-4333-8333-333333333333', group_id: 'group-1',
    library_path: '/other/foliole.db', path_flavor: 'posix'
  });
  Object.assign(extra, { device_identity_key: identity.identity_key,
    device_anchor: identity.device_anchor, canonical_library_path: identity.canonical_library_path });
  const decision = (id: string, target: string) => ({
    decision_id: id, target_device_identity_key: target, initiated_by_device_identity_key: provider.identity_key,
    completed_at: null, superseded_at: null, created_at: 'now',
    confirmations: [{ confirming_device_identity_key: local.identity_key, kind: 'enforced' as const, confirmed_at: 'now' }]
  });
  const applied = await applyCompanionSyncGroupMemberState({ ...state, devices: [...state.devices, extra],
    removals: [decision('one', provider.identity_key), decision('two', extra.device_identity_key)],
    sender_device_identity_key: provider.identity_key }, provider.identity_key);
  expect(applied.local_exited).toBe(false);
  expect(applied.state.removals.every(item => item.completed_at !== null)).toBe(true);
  expect(applied.state.devices.filter(device => device.state === 'active').map(device => device.device_identity_key))
    .toEqual([local.identity_key]);
  expect((await loadCompanionSyncGroup())?.removing_devices).toEqual([]);
});
