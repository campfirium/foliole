// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from '../../lib/core/database/syncPackDependencyStagingSchema.js';
import { loadSyncPackDependencyResume, retireObsoleteSyncPackDependencyViews,
  retireSyncPackDependencyView } from '../../lib/core/sync/syncPackDependencyResume.js';
import { stageSyncPackDependencyPage } from '../../lib/core/sync/syncPackDependencyStaging.js';
import {
  advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
  type SyncPackDependencyRow, type SyncPackDependencyTransfer
} from '../../lib/core/sync/syncPackDependencyTransfer.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let root: string;
let target: Database.Database;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dependency-staging-'));
  target = new Database(path.join(root, 'target.db'));
  for (const sql of SYNC_PACK_DEPENDENCY_STAGING_SCHEMA) target.exec(sql);
  target.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY);
    CREATE TABLE business_cursor (seq INTEGER); INSERT INTO business_cursor VALUES (0);`);
});

afterEach(async () => {
  target.close();
  await fs.rm(root, { force: true, recursive: true });
});

function row(id: string, body = 'body'): SyncPackDependencyRow {
  return { table: 'node_sync_versions', key: { key: id, ordinal: -1 },
    json: JSON.stringify({ version_id: id, object_id: 'article', body_text: body }) };
}

function transfer(rows: SyncPackDependencyRow[]): SyncPackDependencyTransfer {
  return { groupId: 'group', peerId: 'peer', sourceViewId: 'view', sourceEpoch: 'epoch',
    objectType: 'node', objectId: 'article', fromStateSeq: 0, objectStateSeq: 23,
    frontierStateSeq: 50, expectedRows: rows.length,
    expectedDigest: rows.reduce(advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST) };
}

function page(scope: SyncPackDependencyTransfer, rows: SyncPackDependencyRow[], afterRow = 0,
  beforeDigest = SYNC_PACK_DEPENDENCY_INITIAL_DIGEST) {
  return { transfer: scope, rows, afterRow, beforeDigest,
    afterDigest: rows.reduce(advanceSyncPackDependencyDigest, beforeDigest) };
}

it('retires only the unavailable view durably and rejects its old pages after a new round starts', async () => {
  const rows = [row('v1'), row('v2')];
  const old = transfer(rows);
  const other = { ...old, peerId: 'other-peer' };
  let port = createBetterSqliteDbPort(target);
  await stageSyncPackDependencyPage(port, page(old, rows.slice(0, 1)));
  await stageSyncPackDependencyPage(port, page(other, rows.slice(0, 1)));
  target.exec("INSERT INTO nodes VALUES ('already-applied'); UPDATE business_cursor SET seq = 17;");
  await retireSyncPackDependencyView(port, old);
  target.close();
  target = new Database(path.join(root, 'target.db'));
  port = createBetterSqliteDbPort(target);
  expect(await loadSyncPackDependencyResume(port, old)).toBeNull();
  expect(await loadSyncPackDependencyResume(port, other)).toMatchObject({ nextRow: 1 });
  const fresh = { ...old, sourceViewId: 'fresh-view' };
  await stageSyncPackDependencyPage(port, page(fresh, rows.slice(0, 1)));
  await expect(stageSyncPackDependencyPage(port, page(old, rows.slice(0, 1))))
    .rejects.toThrow('sync_pack_dependency_source_view_retired');
  expect(await loadSyncPackDependencyResume(port, fresh)).toMatchObject({
    nextRow: 1, transfer: { sourceViewId: 'fresh-view', sourceEpoch: 'epoch' }
  });
  expect(target.prepare('SELECT id FROM nodes').all()).toEqual([{ id: 'already-applied' }]);
  expect(target.prepare('SELECT seq FROM business_cursor').get()).toEqual({ seq: 17 });
});

it('retires unfinished views behind the committed cursor without touching the current round or another peer', async () => {
  const rows = [row('v1'), row('v2')];
  const old = transfer(rows);
  const current = { ...old, sourceViewId: 'current-view', fromStateSeq: 17 };
  const other = { ...old, sourceViewId: 'other-view', peerId: 'other-peer' };
  const port = createBetterSqliteDbPort(target);
  for (const scope of [old, current, other]) {
    await stageSyncPackDependencyPage(port, page(scope, rows.slice(0, 1)));
  }
  await retireObsoleteSyncPackDependencyViews(port, {
    groupId: 'group', peerId: 'peer', currentCursor: 17 });
  expect(await loadSyncPackDependencyResume(port, old)).toBeNull();
  expect(await loadSyncPackDependencyResume(port, current)).toMatchObject({ nextRow: 1 });
  expect(await loadSyncPackDependencyResume(port, other)).toMatchObject({ nextRow: 1 });
  await expect(stageSyncPackDependencyPage(port, page(old, rows.slice(0, 1))))
    .rejects.toThrow('sync_pack_dependency_source_view_retired');
});

it('durably stages pages and replay without publishing a node or advancing its business cursor', async () => {
  const rows = [row('v1'), row('v2'), row('v3')];
  const scope = transfer(rows);
  const first = page(scope, rows.slice(0, 2));
  expect(await stageSyncPackDependencyPage(createBetterSqliteDbPort(target), first))
    .toEqual({ nextRow: 2, completed: false, replay: false });
  target.close();
  target = new Database(path.join(root, 'target.db'));
  const port = createBetterSqliteDbPort(target);
  expect(await stageSyncPackDependencyPage(port, first))
    .toEqual({ nextRow: 2, completed: false, replay: true });
  const last = page(scope, rows.slice(2), 2, first.afterDigest);
  expect(await stageSyncPackDependencyPage(port, last))
    .toEqual({ nextRow: 3, completed: true, replay: false });
  expect(await stageSyncPackDependencyPage(port, last))
    .toEqual({ nextRow: 3, completed: true, replay: true });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 3 });
  expect(target.prepare('SELECT count(*) AS count FROM nodes').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT seq FROM business_cursor').get()).toEqual({ seq: 0 });
});

it('rolls back both rows and position when any row in a page fails', async () => {
  const rows = [row('v1'), row('v2'), row('v3')];
  const scope = transfer(rows);
  const first = page(scope, rows.slice(0, 1));
  const port = createBetterSqliteDbPort(target);
  await stageSyncPackDependencyPage(port, first);
  target.exec(`CREATE TRIGGER fail_row BEFORE INSERT ON sync_pack_dependency_rows
    WHEN NEW.row_index = 2 BEGIN SELECT RAISE(ABORT, 'injected_write_failure'); END;`);
  const next = page(scope, rows.slice(1), 1, first.afterDigest);
  await expect(stageSyncPackDependencyPage(port, next)).rejects.toThrow('injected_write_failure');
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 1 });
  expect(target.prepare('SELECT next_row FROM sync_pack_dependency_transfers').get()).toEqual({ next_row: 1 });
  target.exec('DROP TRIGGER fail_row');
  expect(await stageSyncPackDependencyPage(port, next)).toMatchObject({ nextRow: 3, completed: true });
});

it('rejects changed replay, missing prefix, mixed view, and incorrect object completion digest', async () => {
  const rows = [row('v1'), row('v2')];
  const scope = transfer(rows);
  const first = page(scope, rows.slice(0, 1));
  const port = createBetterSqliteDbPort(target);
  await stageSyncPackDependencyPage(port, first);
  await expect(stageSyncPackDependencyPage(port, page(scope, [row('v1', 'changed')]))).
    rejects.toThrow('sync_pack_dependency_replay_changed');
  await expect(stageSyncPackDependencyPage(port, page(scope, [rows[1]!], 2, first.afterDigest))).
    rejects.toThrow('sync_pack_dependency_page_invalid');
  await expect(stageSyncPackDependencyPage(port, page({ ...scope, sourceViewId: 'new-view' },
    [rows[1]!], 1, first.afterDigest))).rejects.toThrow('sync_pack_dependency_page_not_contiguous');
  const altered = { ...scope, expectedDigest: '0'.repeat(64) };
  await expect(stageSyncPackDependencyPage(port, page(altered, [rows[1]!], 1, first.afterDigest))).
    rejects.toThrow('sync_pack_dependency_transfer_changed');
  await expect(stageSyncPackDependencyPage(port, page({ ...altered, sourceViewId: 'bad-digest' }, rows))).
    rejects.toThrow('sync_pack_dependency_object_digest_mismatch');
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 1 });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_transfers').get()).toEqual({ count: 1 });
});

it('rejects an oversized dependency page without leaving a transfer or any row', async () => {
  const rows = [row('large', 'x'.repeat(2 * 1024 * 1024))];
  await expect(stageSyncPackDependencyPage(createBetterSqliteDbPort(target), page(transfer(rows), rows)))
    .rejects.toThrow('sync_pack_dependency_page_over_budget');
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_transfers').get()).toEqual({ count: 0 });
});
