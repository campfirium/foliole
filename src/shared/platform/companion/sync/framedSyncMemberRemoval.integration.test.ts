// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { heldTransfers, identities, openMemberDatabase, publishMemberDelivery } from '../../../../../electron/database/framedSyncMemberRemoval.testSupport.js';
import { applyDesktopSyncGroupMemberState, initiateDesktopSyncGroupDeviceRemoval,
  loadDesktopSyncGroupMemberState } from '../../../../../electron/database/syncGroupMemberStateStore.js';
import { leaveDesktopSyncGroupDevice, registerSyncGroupDevice } from '../../../../../electron/database/syncGroupStore.js';
import { parseSyncGroupMemberState } from '../../../../../lib/platform/syncGroupMemberStateContract.js';

import { applyCompanionSyncGroupMemberState } from './syncGroupMemberStateStore';

const binding = vi.hoisted(() => ({ sqlite: null as Database.Database | null }));
vi.mock('../../../../../electron/database/connection.js', async () => {
  const { createBetterSqlite3Driver: driver } = await import('../../../../../electron/database/betterSqlite3Driver.js');
  return { openDatabaseConnection: () => {
    if (!binding.sqlite) throw new Error('fixture_database_unbound');
    return { driver: driver(binding.sqlite) };
  } };
});
vi.mock('../runtime/iosCompanionDatabaseBootstrap', async () => {
  const { createBetterSqliteDbPort: port } = await import('../../../../../electron/database/betterSqliteDbPort.js');
  return { getIosCompanionDatabaseOwner: () => {
    if (!binding.sqlite) throw new Error('fixture_database_unbound');
    const db = port(binding.sqlite);
    return { read: <T>(task: (value: typeof db) => T) => task(db),
      runWriter: <T>(task: (value: typeof db) => T) => task(db) };
  } };
});

let root: string;
const databases: Database.Database[] = [];
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'framed-member-removal-')); });
afterEach(async () => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  binding.sqlite = null;
  await fs.rm(root, { recursive: true, force: true });
});
function bind(db: Database.Database) { binding.sqlite = db; }
function device(index: number) {
  const db = openMemberDatabase(path.join(root, `${index}.db`), index, bind);
  databases.push(db);
  return db;
}
const wire = () => parseSyncGroupMemberState(JSON.parse(JSON.stringify(loadDesktopSyncGroupMemberState())));

it.each(['desktop', 'companion'])('releases only the confirmed target deliveries through %s member apply', async (host) => {
  const a = device(0), b = device(1), c = device(2);
  const removed = await publishMemberDelivery(a, 2);
  const kept = [await publishMemberDelivery(a, 1), await publishMemberDelivery(a, 2, 'another-group'),
    await publishMemberDelivery(a, 2, 'group-removal', identities[1]!.identity_key)].sort();
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  expect(heldTransfers(a)).toEqual([...kept, removed].sort());
  const decision = wire();
  bind(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  bind(a);
  if (host === 'desktop') applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key);
  else await applyCompanionSyncGroupMemberState(exited, identities[2]!.identity_key);
  expect(heldTransfers(a)).toEqual(kept);
  expect(a.prepare('SELECT state FROM framed_sync_outbound_publications WHERE hex(transfer_id) = ?')
    .get(removed.toUpperCase())).toEqual({ state: 'terminated' });
  expect(a.prepare('SELECT COUNT(*) AS count FROM framed_sync_outbound_fact_refs').get()).toEqual({ count: 4 });
  a.close();
  const reopened = new Database(path.join(root, '0.db'));
  databases.push(reopened);
  bind(reopened);
  applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key);
  expect(heldTransfers(reopened)).toEqual(kept);
  bind(b);
  expect(wire().devices.find((value) => value.device_identity_key === identities[2]!.identity_key)?.state)
    .toBe('active');
});

it('retains an offline target until every remaining member confirms', async () => {
  const a = device(0), b = device(1);
  const transfer = await publishMemberDelivery(a, 2);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  expect(heldTransfers(a)).toEqual([transfer]);
  const decision = wire();
  bind(b);
  const confirmed = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  expect(heldTransfers(a)).toEqual([transfer]);
  bind(a);
  applyDesktopSyncGroupMemberState(confirmed, identities[1]!.identity_key);
  expect(heldTransfers(a)).toEqual([]);
});

it('does not use ordinary local leave as permission to release other members deliveries', async () => {
  const a = device(0);
  const transfer = await publishMemberDelivery(a, 2);
  bind(a);
  leaveDesktopSyncGroupDevice(identities[0]!.identity_key);
  expect(heldTransfers(a)).toEqual([transfer]);
});

it.each(['desktop', 'companion'])('rolls back membership completion when %s hold release fails', async (host) => {
  const a = device(0), c = device(2);
  const transfer = await publishMemberDelivery(a, 2);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const decision = wire();
  bind(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  bind(a);
  a.exec(`CREATE TRIGGER reject_hold_release BEFORE DELETE ON framed_sync_outbound_holds
    BEGIN SELECT RAISE(ABORT, 'fixture_release_failure'); END`);
  const apply = async () => host === 'desktop'
    ? applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key)
    : applyCompanionSyncGroupMemberState(exited, identities[2]!.identity_key);
  await expect(apply()).rejects.toThrow('fixture_release_failure');
  expect(heldTransfers(a)).toEqual([transfer]);
  expect(wire().removals[0]?.completed_at).toBeNull();
  expect(a.prepare('SELECT state FROM framed_sync_outbound_publications').get()).toEqual({ state: 'published' });
  a.exec('DROP TRIGGER reject_hold_release');
  await apply();
  expect(heldTransfers(a)).toEqual([]);
});

it('does not treat a peer supplied completed flag as a confirmed permanent removal', async () => {
  const a = device(0);
  const transfer = await publishMemberDelivery(a, 2);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const unconfirmed = wire();
  for (const removal of unconfirmed.removals) removal.completed_at = '2026-10-06T00:00:00.000Z';
  applyDesktopSyncGroupMemberState(unconfirmed, identities[0]!.identity_key);
  expect(heldTransfers(a)).toEqual([transfer]);
  expect(wire().removals[0]?.completed_at).toBeNull();
});

it('keeps a new delivery protected after an approved rejoin supersedes the old removal', async () => {
  const a = device(0), c = device(2);
  await publishMemberDelivery(a, 2);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const decision = wire();
  bind(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  bind(a);
  applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key);
  expect(heldTransfers(a)).toEqual([]);
  registerSyncGroupDevice({ device: identities[2]!, deviceName: 'Approved rejoin', platform: 'desktop' });
  const newTransfer = await publishMemberDelivery(a, 2, 'group-removal', identities[0]!.identity_key, 'rejoined-epoch');
  const current = wire();
  applyDesktopSyncGroupMemberState(current, identities[0]!.identity_key);
  expect(heldTransfers(a)).toEqual([newTransfer]);
});
