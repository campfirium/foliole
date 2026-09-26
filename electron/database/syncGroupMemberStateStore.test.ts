import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopSourceConnectionSchemaStatements.js';
import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopSourceSchemaStatements.js';
import { WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS } from '../../lib/core/database/numberedMigrationWatchedFolderConflicts.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import {
  applyDesktopSyncGroupMemberState,
  initiateDesktopSyncGroupDeviceRemoval,
  loadDesktopSyncGroupMemberState,
  loadPendingDesktopSyncGroupRemovalDeviceIds
} from './syncGroupMemberStateStore.js';
import {
  createDesktopSyncGroup,
  leaveDesktopSyncGroupDevice,
  registerSyncGroupDevice
} from './syncGroupStore.js';
import { loadPendingWatchedFolderConflicts } from './watchedFolderConflictDecisions.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

const databases: Database.Database[] = [];
const anchors = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
];
const identities = anchors.map((deviceAnchor, index) => createSyncGroupDeviceIdentity({
  device_anchor: deviceAnchor, group_id: 'group-1', library_path: `/library/${index}`, path_flavor: 'posix'
}));

beforeEach(() => databases.splice(0));
afterEach(() => databases.splice(0).forEach((database) => database.close()));

it('completes an offline target removal after every Device in the initiator list confirms', () => {
  const a = deviceDatabase(0, [1, 2]);
  const b = deviceDatabase(1, [0, 2]);
  use(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key, '2026-09-15T01:00:00.000Z');
  const decision = loadDesktopSyncGroupMemberState();
  expect(loadPendingDesktopSyncGroupRemovalDeviceIds('group-1')).toEqual([identities[2]!.identity_key]);

  use(b);
  const fromB = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key,
    '2026-09-15T01:01:00.000Z').state;

  use(a);
  applyDesktopSyncGroupMemberState(fromB, identities[1]!.identity_key, '2026-09-15T01:02:00.000Z');
  expect(loadPendingDesktopSyncGroupRemovalDeviceIds('group-1')).toEqual([]);
  expect(loadDesktopSyncGroupMemberState().devices.find((device) =>
    device.device_identity_key === identities[2]!.identity_key)?.state).toBe('left');
  applyDesktopSyncGroupMemberState(fromB, identities[1]!.identity_key, '2026-09-15T01:03:00.000Z');
  expect(loadDesktopSyncGroupMemberState().devices.find((device) =>
    device.device_identity_key === identities[2]!.identity_key)?.state).toBe('left');

  registerSyncGroupDevice({ device: identities[2]!, deviceName: 'C rejoined', platform: 'desktop' });
  const approvedRejoin = loadDesktopSyncGroupMemberState();
  use(b);
  applyDesktopSyncGroupMemberState(approvedRejoin, identities[0]!.identity_key,
    '2026-09-15T01:04:00.000Z');
  expect(loadDesktopSyncGroupMemberState().devices.find((device) =>
    device.device_identity_key === identities[2]!.identity_key)?.state).toBe('active');
});

it('completes immediately when the target confirms its own exit', () => {
  const a = deviceDatabase(0, [1, 2]);
  const c = deviceDatabase(2, [0, 1]);
  use(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key, '2026-09-15T02:00:00.000Z');
  const decision = loadDesktopSyncGroupMemberState();

  use(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key,
    '2026-09-15T02:01:00.000Z');
  expect(exited.localExited).toBe(true);

  use(a);
  applyDesktopSyncGroupMemberState(exited.state, identities[2]!.identity_key,
    '2026-09-15T02:02:00.000Z');
  expect(loadPendingDesktopSyncGroupRemovalDeviceIds('group-1')).toEqual([]);
});

it('learns unknown members independently and never revives a removed Device from an old active snapshot', () => {
  const a = deviceDatabase(0, [1, 2]);
  const d = deviceDatabase(3, []);
  use(d);
  const fromD = loadDesktopSyncGroupMemberState();

  use(a);
  applyDesktopSyncGroupMemberState(fromD, identities[3]!.identity_key);
  expect(loadDesktopSyncGroupMemberState().devices.some((device) =>
    device.device_identity_key === identities[3]!.identity_key)).toBe(true);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const oldActive = loadDesktopSyncGroupMemberState();
  oldActive.devices.find((device) => device.device_identity_key === identities[2]!.identity_key)!.state = 'active';
  applyDesktopSyncGroupMemberState(oldActive, identities[0]!.identity_key);
  expect(loadPendingDesktopSyncGroupRemovalDeviceIds('group-1')).toContain(identities[2]!.identity_key);
});

it('retains a publishable member snapshot after the local Device leaves', () => {
  deviceDatabase(0, [1, 2]);
  leaveDesktopSyncGroupDevice(identities[0]!.identity_key, '2026-09-15T03:00:00.000Z');

  const departed = loadDesktopSyncGroupMemberState({
    groupId: 'group-1', senderDeviceId: identities[0]!.identity_key
  });

  expect(departed.sender_device_identity_key).toBe(identities[0]!.identity_key);
  expect(departed.devices.find((device) =>
    device.device_identity_key === identities[0]!.identity_key)).toMatchObject({
    left_at: '2026-09-15T03:00:00.000Z', state: 'left'
  });
});

it('exchanges watched sources before article sync and finds an exact-path conflict on both devices', () => {
  const a = deviceDatabase(0, [1]);
  const b = deviceDatabase(1, [0]);
  insertWatchedSource(a, identities[0]!.identity_key, 'a-source', '/Shared/Articles');
  insertWatchedSource(b, identities[1]!.identity_key, 'b-source', '/Shared/Articles');

  use(a);
  const fromA = loadDesktopSyncGroupMemberState();
  use(b);
  const fromB = applyDesktopSyncGroupMemberState(fromA, identities[0]!.identity_key).state;
  expect(loadPendingWatchedFolderConflicts()).toHaveLength(1);
  use(a);
  applyDesktopSyncGroupMemberState(fromB, identities[1]!.identity_key);
  expect(loadPendingWatchedFolderConflicts()).toHaveLength(1);
  expect(a.prepare('SELECT COUNT(*) AS count FROM watched_folder_bindings').get()).toEqual({ count: 2 });
  expect(b.prepare('SELECT COUNT(*) AS count FROM watched_folder_bindings').get()).toEqual({ count: 2 });
});

function insertWatchedSource(database: Database.Database, ownerId: string, id: string, folder: string) {
  database.prepare(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES (?, 'watched', ?, ?, 'macOS', ?, 'posix', '{}', 'now', 'now')`)
    .run(`watched:${id}`, id, id, folder);
  database.prepare(`INSERT INTO watched_folder_bindings
    (binding_id, connection_status, action_mode, highlight_mode, primary_path,
     reported_path, created_at, updated_at, source_ref, owner_device_identity_key)
    VALUES (?, 'connected', 'keep', 'merged', ?, ?, 'now', 'now', ?, ?)`)
    .run(id, folder, folder, `watched:${id}`, ownerId);
}

function deviceDatabase(localIndex: number, remoteIndexes: number[]) {
  const database = new Database(':memory:');
  databases.push(database);
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) database.exec(statement);
  for (const statement of [...DESKTOP_SOURCE_SCHEMA_STATEMENTS,
    ...WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS, ...WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS]) {
    database.exec(statement);
  }
  database.exec('CREATE TABLE sync_delivery_receipts (peer_id TEXT)');
  database.exec('CREATE TABLE sync_peer_cursors (peer_id TEXT)');
  use(database);
  createDesktopSyncGroup({
    device: identities[localIndex]!, deviceName: localIndex.toString(), platform: 'desktop',
    workgroupKey: Buffer.alloc(32, 4).toString('base64url')
  });
  for (const index of remoteIndexes) registerSyncGroupDevice({
    device: identities[index]!, deviceName: index.toString(), platform: 'desktop'
  });
  return database;
}

function use(database: Database.Database) {
  connection.current = { driver: createBetterSqlite3Driver(database) };
}
