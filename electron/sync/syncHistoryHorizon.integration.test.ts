// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { prepareImportedNodeDeletionVersions } from '../database/importedNodeDeletionVersions.js';

import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess,
  type DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

const EDITED = 'stopped-editing';
const DELETED = 'deleted-long-ago';
const LONG_AGO = '2026-09-01T00:00:00.000Z';

type Fixture = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>;

/** One full group round through compatibility, member state, database and the closing member state. */
function groupRound(from: DesktopFramedSyncFixtureProcess, to: DesktopFramedSyncFixtureSnapshot) {
  return from.invoke('identity_restore_round', { mode: 'restore', restoreId: 'unused',
    peerOrigin: to.origin, peerDeviceId: to.deviceId });
}

function withDb<T>(databasePath: string, run: (db: Database.Database) => T) {
  const db = new Database(databasePath);
  try { return run(db); } finally { db.close(); }
}

function versionIds(databasePath: string, nodeId: string) {
  return withDb(databasePath, db => db.prepare(`SELECT version_id FROM node_sync_versions
    WHERE object_id = ? ORDER BY version_id`).pluck().all(nodeId) as string[]);
}

function nodeTraces(databasePath: string, nodeId: string) {
  return withDb(databasePath, db => ({
    node: db.prepare('SELECT count(*) FROM nodes WHERE id = ?').pluck().get(nodeId),
    tombstone: db.prepare('SELECT count(*) FROM node_sync_tombstones WHERE node_id = ?').pluck().get(nodeId),
    versions: db.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id = ?').pluck().get(nodeId),
    inventory: db.prepare("SELECT count(*) FROM framed_sync_inventory WHERE object_type = 'node' AND object_id = ?")
      .pluck().get(nodeId)
  }));
}

/** Time passing on every device at once: history, deletions and group coverage all become 60 days older. */
function passTime(databasePath: string) {
  const older = (at: string) => new Date(Date.parse(at) - 60 * 24 * 60 * 60 * 1000).toISOString();
  withDb(databasePath, db => {
    db.function('older', older);
    db.exec(`UPDATE node_sync_versions SET created_at = older(created_at);
      UPDATE node_sync_tombstones SET deleted_at = older(deleted_at), created_at = older(created_at)`);
    for (const row of db.prepare("SELECT key, value FROM sync_group_metadata WHERE key LIKE 'sync_group_coverage:%'")
      .all() as Array<{ key: string; value: string }>) {
      const coverage = JSON.parse(row.value) as { cells: Record<string, Record<string, string>> };
      for (const cells of Object.values(coverage.cells)) for (const origin of Object.keys(cells)) cells[origin] = older(cells[origin]!);
      db.prepare('UPDATE sync_group_metadata SET value = ? WHERE key = ?').run(JSON.stringify(coverage), row.key);
    }
  });
}

function retireThirdMember(databasePath: string, thirdId: string) {
  withDb(databasePath, db => db.prepare(`UPDATE sync_group_devices SET state = 'left', left_at = ?
    WHERE device_identity_key = ?`).run(LONG_AGO, thirdId));
}

/** Deleted a month ago: after the third member last synced, long before the rounds that follow. */
function deletePermanently(databasePath: string, nodeId: string) {
  withDb(databasePath, db => {
    const driver = createBetterSqlite3Driver(db);
    db.exec("ATTACH DATABASE ':memory:' AS search");
    initializeWorkspaceSearchSidecar({ sqlite: db, driver });
    const deletedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    prepareImportedNodeDeletionVersions(driver, [nodeId], deletedAt);
    deleteNodesPermanently(driver, { nodeIds: [nodeId], nodeOrder: [], deletedAt });
  });
}

async function seedHistory(fixture: Fixture) {
  for (const content of ['Draft one', 'Draft two', 'Final text']) {
    await fixture.left.seed({ content, nodeId: EDITED, title: 'Stopped editing' });
  }
  await fixture.left.seed({ content: 'Doomed text', nodeId: DELETED, title: 'Deleted' });
}

async function withFixture(run: (fixture: Fixture, trackThird: (process: DesktopFramedSyncFixtureProcess) => void) => Promise<void>) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let third: DesktopFramedSyncFixtureProcess | null = null;
  try {
    await run(fixture, process => { third = process; });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), (third as DesktopFramedSyncFixtureProcess | null)?.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

it('reclaims old history and deletions once every member has passed them', { meta: { calibratedMs: 90_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  const third = started.snapshot;
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) retireThirdMember(path, third.deviceId);
  await seedHistory(fixture);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) passTime(path);
  deletePermanently(fixture.leftSnapshot.databasePath, DELETED);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  const head = withDb(fixture.leftSnapshot.databasePath, db => db.prepare(
    'SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(EDITED));
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(versionIds(path, EDITED)).toEqual([head]);
    expect(withDb(path, db => db.prepare(`SELECT version.body_text FROM nodes node JOIN node_sync_versions version
      ON version.version_id = node.current_version_id WHERE node.id = ?`).pluck().get(EDITED))).toBe('Final text');
    expect(nodeTraces(path, DELETED)).toEqual({ node: 0, tombstone: 0, versions: 0, inventory: 0 });
  }
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(versionIds(fixture.rightSnapshot.databasePath, EDITED)).toEqual([head]);
  expect(nodeTraces(fixture.rightSnapshot.databasePath, DELETED).versions).toBe(0);
}));

it('keeps history and deletions while a member has not caught up, then reclaims them without revival', { meta: { calibratedMs: 150_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  const third = started.snapshot;
  await seedHistory(fixture);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED).node).toBe(1);
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath, third.databasePath]) passTime(path);
  deletePermanently(fixture.leftSnapshot.databasePath, DELETED);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(versionIds(path, EDITED)).toHaveLength(3);
    expect(nodeTraces(path, DELETED)).toMatchObject({ node: 0, tombstone: 1 });
  }

  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED)).toMatchObject({ node: 0, tombstone: 1 });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath, third.databasePath]) {
    expect(versionIds(path, EDITED), path).toHaveLength(1);
    expect(nodeTraces(path, DELETED), path).toEqual({ node: 0, tombstone: 0, versions: 0, inventory: 0 });
  }
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED).node).toBe(0);
}));
