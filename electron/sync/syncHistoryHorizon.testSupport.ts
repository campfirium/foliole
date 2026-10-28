import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { prepareImportedNodeDeletionVersions } from '../database/importedNodeDeletionVersions.js';

import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess,
  type DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

export const EDITED = 'stopped-editing';
export const DELETED = 'deleted-long-ago';
export const LONG_AGO = '2026-09-01T00:00:00.000Z';

export type Fixture = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>;

/** One full group round through compatibility, member state, database and the closing member state. */
export function groupRound(from: DesktopFramedSyncFixtureProcess, to: DesktopFramedSyncFixtureSnapshot) {
  return from.invoke('identity_restore_round', { mode: 'restore', restoreId: 'unused',
    peerOrigin: to.origin, peerDeviceId: to.deviceId });
}

export function withDb<T>(databasePath: string, run: (db: Database.Database) => T) {
  const db = new Database(databasePath);
  try { return run(db); } finally { db.close(); }
}

export function versionIds(databasePath: string, nodeId: string) {
  return withDb(databasePath, db => db.prepare(`SELECT version_id FROM node_sync_versions
    WHERE object_id = ? ORDER BY version_id`).pluck().all(nodeId) as string[]);
}

export function nodeTraces(databasePath: string, nodeId: string) {
  return withDb(databasePath, db => ({
    node: db.prepare('SELECT count(*) FROM nodes WHERE id = ?').pluck().get(nodeId),
    tombstone: db.prepare('SELECT count(*) FROM node_sync_tombstones WHERE node_id = ?').pluck().get(nodeId),
    versions: db.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id = ?').pluck().get(nodeId),
    inventory: db.prepare("SELECT count(*) FROM framed_sync_inventory WHERE object_type = 'node' AND object_id = ?")
      .pluck().get(nodeId)
  }));
}

/**
 * Time passing on every device at once: history and deletions become older, and so does the coverage of
 * every member, or only of `silentMember` when the others kept syncing meanwhile.
 */
export function passTime(databasePath: string, days = 60, silentMember?: string) {
  const older = (at: string) => new Date(Date.parse(at) - days * 24 * 60 * 60 * 1000).toISOString();
  withDb(databasePath, db => {
    db.function('older', older);
    db.exec(`UPDATE node_sync_versions SET created_at = older(created_at);
      UPDATE node_sync_tombstones SET deleted_at = older(deleted_at), created_at = older(created_at)`);
    db.prepare('UPDATE sync_group_devices SET joined_at = older(joined_at) WHERE ? IS NULL OR device_identity_key = ?')
      .run(silentMember ?? null, silentMember ?? null);
    for (const row of db.prepare("SELECT key, value FROM sync_group_metadata WHERE key LIKE 'sync_group_coverage:%'")
      .all() as Array<{ key: string; value: string }>) {
      const coverage = JSON.parse(row.value) as { cells: Record<string, Record<string, string>> };
      for (const [holder, cells] of Object.entries(coverage.cells)) for (const origin of Object.keys(cells)) {
        if (!silentMember || holder === silentMember || origin === silentMember) cells[origin] = older(cells[origin]!);
      }
      db.prepare('UPDATE sync_group_metadata SET value = ? WHERE key = ?').run(JSON.stringify(coverage), row.key);
    }
  });
}

export function retireThirdMember(databasePath: string, thirdId: string) {
  withDb(databasePath, db => db.prepare(`UPDATE sync_group_devices SET state = 'left', left_at = ?
    WHERE device_identity_key = ?`).run(LONG_AGO, thirdId));
}

/** Deleted a month ago: after the third member last synced, long before the rounds that follow. */
export function deletePermanently(databasePath: string, nodeId: string,
  deletedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) {
  withDb(databasePath, db => {
    const driver = createBetterSqlite3Driver(db);
    db.exec("ATTACH DATABASE ':memory:' AS search");
    initializeWorkspaceSearchSidecar({ sqlite: db, driver });
    prepareImportedNodeDeletionVersions(driver, [nodeId], deletedAt);
    deleteNodesPermanently(driver, { nodeIds: [nodeId], deletedAt });
  });
}

export async function seedHistory(fixture: Fixture) {
  for (const content of ['Draft one', 'Draft two', 'Final text']) {
    await fixture.left.seed({ content, nodeId: EDITED, title: 'Stopped editing' });
  }
  await fixture.left.seed({ content: 'Doomed text', nodeId: DELETED, title: 'Deleted' });
}

export async function withFixture(run: (fixture: Fixture, trackThird: (process: DesktopFramedSyncFixtureProcess) => void) => Promise<void>) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let third: DesktopFramedSyncFixtureProcess | null = null;
  try {
    await run(fixture, process => { third = process; });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), (third as DesktopFramedSyncFixtureProcess | null)?.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}
