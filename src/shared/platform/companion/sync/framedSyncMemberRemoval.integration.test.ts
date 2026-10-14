// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { identities, memberState, openMemberDatabase, originalFacts, seedMemberFacts } from '../../../../../electron/database/framedSyncMemberRemoval.testSupport.js';
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

it.each(['desktop', 'companion'])('removes only the confirmed target through %s apply and preserves original facts', async host => {
  const a = device(0), b = device(1), c = device(2);
  const facts = await seedMemberFacts(a);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  expect(memberState(a, 2)).toBe('active');
  const decision = wire();
  bind(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  bind(a);
  if (host === 'desktop') applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key);
  else await applyCompanionSyncGroupMemberState(exited, identities[2]!.identity_key);
  expect(memberState(a, 2)).toBe('left');
  expect(memberState(a, 0)).toBe('active');
  expect(memberState(a, 1)).toBe('active');
  expect(originalFacts(a)).toEqual(facts);
  a.close();
  const reopened = new Database(path.join(root, '0.db'));
  databases.push(reopened); bind(reopened);
  applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key);
  expect(memberState(reopened, 2)).toBe('left');
  expect(originalFacts(reopened)).toEqual(facts);
  bind(b);
  expect(memberState(b, 2)).toBe('active');
});

it('retains an offline target until every remaining member confirms', async () => {
  const a = device(0), b = device(1);
  const facts = await seedMemberFacts(a);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  expect(memberState(a, 2)).toBe('active');
  expect(originalFacts(a)).toEqual(facts);
  const decision = wire();
  bind(b);
  const confirmed = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  expect(memberState(a, 2)).toBe('active');
  bind(a);
  applyDesktopSyncGroupMemberState(confirmed, identities[1]!.identity_key);
  expect(memberState(a, 2)).toBe('left');
  expect(originalFacts(a)).toEqual(facts);
});

it('preserves member positions, current text and version identity after ordinary local leave', async () => {
  const a = device(0);
  const facts = await seedMemberFacts(a);
  bind(a);
  const versionIdentitySql = 'SELECT version_id, object_id, content_hash, parent_version_id, created_at, host_name FROM node_sync_versions ORDER BY version_id';
  const versionIdentities = a.prepare(versionIdentitySql).all();
  leaveDesktopSyncGroupDevice(identities[0]!.identity_key);
  expect(memberState(a, 0)).toBe('left');
  expect(memberState(a, 1)).toBe('active');
  expect(memberState(a, 2)).toBe('active');
  const after = originalFacts(a);
  expect(after.nodes).toEqual(facts.nodes);
  expect(after.parents).toEqual(facts.parents);
  expect(after.positions).toEqual(facts.positions);
  expect(a.prepare(versionIdentitySql).all()).toEqual(versionIdentities);
  expect(a.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'current-head', body_text: 'Current complete body' },
      { version_id: 'original-base', body_text: null }]);
});

it.each(['desktop', 'companion'])('rolls back membership and confirmation when %s completion fails', async host => {
  const a = device(0), c = device(2);
  const facts = await seedMemberFacts(a);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const decision = wire();
  bind(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  bind(a);
  const before = wire();
  a.exec(`CREATE TRIGGER reject_completion BEFORE UPDATE OF completed_at ON sync_group_removal_decisions
    WHEN NEW.completed_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'fixture_completion_failure'); END`);
  const apply = async () => host === 'desktop'
    ? applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key)
    : applyCompanionSyncGroupMemberState(exited, identities[2]!.identity_key);
  await expect(apply()).rejects.toThrow('fixture_completion_failure');
  expect(wire()).toEqual(before);
  expect(memberState(a, 2)).toBe('active');
  expect(originalFacts(a)).toEqual(facts);
  a.exec('DROP TRIGGER reject_completion');
  await apply();
  expect(memberState(a, 2)).toBe('left');
  expect(originalFacts(a)).toEqual(facts);
});

it('does not treat a peer supplied completed flag as a confirmed permanent removal', async () => {
  const a = device(0);
  const facts = await seedMemberFacts(a);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const unconfirmed = wire();
  for (const removal of unconfirmed.removals) removal.completed_at = '2026-10-06T00:00:00.000Z';
  applyDesktopSyncGroupMemberState(unconfirmed, identities[0]!.identity_key);
  expect(memberState(a, 2)).toBe('active');
  expect(originalFacts(a)).toEqual(facts);
  expect(wire().removals[0]?.completed_at).toBeNull();
});

it('preserves approved rejoin and current positions when the superseded removal is replayed', async () => {
  const a = device(0), c = device(2);
  await seedMemberFacts(a);
  bind(a);
  initiateDesktopSyncGroupDeviceRemoval(identities[2]!.identity_key);
  const decision = wire();
  bind(c);
  const exited = applyDesktopSyncGroupMemberState(decision, identities[0]!.identity_key).state;
  bind(a);
  applyDesktopSyncGroupMemberState(exited, identities[2]!.identity_key);
  expect(memberState(a, 2)).toBe('left');
  registerSyncGroupDevice({ device: identities[2]!, deviceName: 'Approved rejoin', platform: 'desktop' });
  a.prepare(`UPDATE node_version_member_positions SET library_epoch = 'rejoined-epoch', proof_revision = 2
    WHERE group_id = 'group-removal' AND device_identity_key = ?`).run(identities[2]!.identity_key);
  const facts = originalFacts(a);
  const current = wire();
  expect(current.removals[0]?.superseded_at).not.toBeNull();
  applyDesktopSyncGroupMemberState(current, identities[0]!.identity_key);
  expect(memberState(a, 2)).toBe('active');
  expect(originalFacts(a)).toEqual(facts);
});
