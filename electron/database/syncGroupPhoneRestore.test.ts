import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { syncGroupLocalPublicationBlockReason } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyDesktopSyncGroupMemberState, loadDesktopSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

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

afterEach(() => databases.splice(0).forEach((database) => database.close()));

it.each(['adopting group data', 'not adopting'])('settles a restore published by a phone that is %s', async (scenario) => {
  const desktop = deviceDatabase(0, [1]);
  markPhone(desktop, 1);
  const phoneId = identities[1]!.identity_key;
  const phone = phoneState(1);
  insertPendingRestore(desktop, phoneId);
  // The source marked its own restore applied; once it adopts group data it no longer reports one.
  if (scenario === 'adopting group data') phone.adopting_from = identities[0]!.identity_key;
  else phone.restore = { applied: true, event: { group_id: 'group-1', restore_id: 'stuck',
    restored_at: '2026-11-01T00:00:00.000Z', source_device_identity_key: phoneId } };
  const port = createBetterSqliteDbPort(desktop);
  use(desktop);
  expect(await syncGroupLocalPublicationBlockReason(port)).toBe('sync_group_restore_pending');

  const applied = applyDesktopSyncGroupMemberState(phone, phoneId);

  expect(applied.normalSyncReady).toBe(true);
  expect(applied.state.restore?.applied).toBe(true);
  expect(await syncGroupLocalPublicationBlockReason(port)).toBeNull();
});

it.each(['a computer source', 'a half received overwrite'])('keeps a restore pending for %s', (scenario) => {
  const desktop = deviceDatabase(0, [1, 2]);
  markPhone(desktop, 1);
  const phoneId = identities[1]!.identity_key;
  const phone = phoneState(1);
  insertPendingRestore(desktop, scenario === 'a computer source' ? identities[2]!.identity_key : phoneId);
  if (scenario === 'a half received overwrite') desktop.prepare(`INSERT INTO sync_group_metadata
    (key, value, updated_at) VALUES ('sync_group_overwrite_progress', '{}', '2026-11-27')`).run();
  use(desktop);

  expect(applyDesktopSyncGroupMemberState(phone, phoneId).state.restore?.applied).toBe(false);
});

it('settles a phone restore on a computer that only heard of it through another computer', () => {
  const first = deviceDatabase(0, [1, 2]);
  markPhone(first, 2);
  insertPendingRestore(first, identities[2]!.identity_key);
  first.prepare("UPDATE sync_group_restore_events SET applied_at = restored_at").run();
  use(first);
  const fromFirst = loadDesktopSyncGroupMemberState();
  const second = deviceDatabase(1, [0]);
  insertPendingRestore(second, identities[2]!.identity_key);
  use(second);

  const applied = applyDesktopSyncGroupMemberState(fromFirst, identities[0]!.identity_key);

  expect(applied.state.restore?.applied).toBe(true);
  expect(applied.normalSyncReady).toBe(true);
});

it('ignores a pending restore left behind by a group this device no longer belongs to', async () => {
  const desktop = deviceDatabase(0, [1]);
  insertPendingRestore(desktop, identities[1]!.identity_key);
  desktop.prepare("DELETE FROM sync_group_local_state").run();

  expect(await syncGroupLocalPublicationBlockReason(createBetterSqliteDbPort(desktop))).toBeNull();
});

function phoneState(index: number): SyncGroupMemberStatePayload {
  use(deviceDatabase(index, [0]));
  return { ...loadDesktopSyncGroupMemberState(), restore: null };
}

function markPhone(database: Database.Database, index: number) {
  database.prepare("UPDATE sync_group_devices SET platform = 'android-capacitor' WHERE device_identity_key = ?")
    .run(identities[index]!.identity_key);
}

function insertPendingRestore(database: Database.Database, sourceId: string) {
  database.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES ('stuck', 'group-1', '2026-11-01T00:00:00.000Z', ?, NULL, '2026-11-01T00:00:00.000Z')`).run(sourceId);
}

function deviceDatabase(localIndex: number, remoteIndexes: number[]) {
  const database = new Database(':memory:');
  databases.push(database);
  initializeDatabaseSchema(database);
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
