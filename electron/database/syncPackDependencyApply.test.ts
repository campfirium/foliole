// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from '../../lib/core/database/syncPackDependencyStagingSchema.js';
import { stageSyncPackDependencyPage } from '../../lib/core/sync/syncPackDependencyStaging.js';
import {
  advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
  type SyncPackDependencyRow, type SyncPackDependencyTransfer
} from '../../lib/core/sync/syncPackDependencyTransfer.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createIncomingPack } from '../sync/syncPackNodeApplyTestSupport.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { describeSyncPackDependencySource, iterateSyncPackDependencyPages } from './syncPackDependencySource.js';
import { createSyncPackSourceView, openSyncPackSourceView } from './syncPackSourceView.js';

let root: string;
let target: Database.Database;
let port: ReturnType<typeof createBetterSqliteDbPort>;
let rows: SyncPackDependencyRow[];
let transfer: SyncPackDependencyTransfer;
const options = { currentCursor: 0, hostName: 'receiver', sourcePeerId: 'source',
  enqueueSearchInvalidations: false };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dependency-apply-'));
  target = new Database(path.join(root, 'target.db'));
  target.pragma('foreign_keys = ON');
  target.exec([...COMPANION_SCHEMA_STATEMENTS, ...SYNC_PACK_DEPENDENCY_STAGING_SCHEMA].join(';\n'));
  target.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');`);
  rows = makeDependencyRows();
  transfer = { groupId: 'group', peerId: 'source', sourceViewId: 'view', sourceEpoch: 'source-test',
    objectType: 'node', objectId: 'node-1', fromStateSeq: 0, objectStateSeq: 1,
    frontierStateSeq: 1, expectedRows: rows.length,
    expectedDigest: rows.reduce(advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST) };
  const incomingPath = path.join(root, 'incoming.db');
  createIncomingPack(incomingPath);
  const incoming = new Database(incomingPath);
  incoming.exec(`DELETE FROM node_sync_versions;
    DELETE FROM sync_objects; DELETE FROM sync_object_state WHERE object_type <> 'node';
    UPDATE nodes SET current_version_id = 'v23';`);
  incoming.prepare('UPDATE pack_manifest SET value = ? WHERE key = ?').run(JSON.stringify({
    source_epoch: 'source-test', from_state_seq: 0, to_state_seq: 1, frontier_state_seq: 1,
    dependency_transfers: [transfer]
  }), 'manifest_json');
  incoming.close();
  port = createBetterSqliteDbPort(target);
  await port.run('ATTACH DATABASE ? AS inc', [incomingPath]);
});

afterEach(async () => {
  target.close();
  await fs.rm(root, { recursive: true, force: true });
});

function makeDependencyRows() {
  const result: SyncPackDependencyRow[] = [];
  const body = 'b'.repeat(741 * 1024);
  for (let i = 1; i <= 23; i++) {
    const id = `v${String(i).padStart(2, '0')}`;
    const parent = i === 1 ? null : `v${String(i - 1).padStart(2, '0')}`;
    result.push({ table: 'node_sync_versions', key: { key: id, ordinal: -1 }, json: JSON.stringify({
      version_id: id, object_id: 'node-1', parent_version_id: parent, host_name: 'source',
      created_at: '2026-09-28', content_hash: `hash-${id}`, body_text: body,
      snapshot_json: '{"id":"node-1","title":"Packed Node","content":null}'
    }) });
    if (parent) result.push({ table: 'node_sync_version_parents', key: { key: id, ordinal: 0 },
      json: JSON.stringify({ version_id: id, parent_version_id: parent, ordinal: 0 }) });
  }
  return result;
}

async function stageThrough(end = rows.length, start = 0) {
  let digest = rows.slice(0, start).reduce(advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST);
  for (let index = start; index < end; index++) {
    const afterDigest = advanceSyncPackDependencyDigest(digest, rows[index]!);
    await stageSyncPackDependencyPage(port, { transfer, afterRow: index, beforeDigest: digest,
      afterDigest, rows: [rows[index]!] });
    digest = afterDigest;
  }
}

function expectCurrentBody(deletedAt: string | null = null) {
  expect(target.prepare(`SELECT n.current_version_id, n.content AS inline, n.deleted_at,
    ${buildNodeBodyContentSql()} AS body FROM nodes n
    LEFT JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash WHERE n.id='node-1'`).get())
    .toEqual({ current_version_id: 'v23', inline: '', deleted_at: deletedAt, body: 'b'.repeat(741 * 1024) });
  expect(target.prepare(`SELECT COUNT(*) AS count, SUM(parent_version_id IS NULL) AS roots,
    MAX(CASE WHEN version_id = 'v23' THEN parent_version_id END) AS head_parent FROM node_sync_versions`).get())
    .toEqual({ count: 23, roots: 1, head_parent: 'v22' });
  expect(target.prepare('SELECT count(*) AS count FROM node_sync_version_parents').get()).toEqual({ count: 22 });
}

function expectCompleteStaging() {
  const staged = target.prepare(`SELECT table_name, payload_json FROM sync_pack_dependency_rows
    WHERE source_view_id=? ORDER BY row_index`).all(transfer.sourceViewId) as Array<{
    table_name: string; payload_json: string;
  }>;
  expect(staged).toHaveLength(45);
  expect(staged.filter((row) => row.table_name === 'node_sync_versions')
    .map((row) => JSON.parse(row.payload_json).body_text)).toEqual(Array(23).fill('b'.repeat(741 * 1024)));
  expect(target.prepare(`SELECT received_digest, completed FROM sync_pack_dependency_transfers
    WHERE source_view_id=?`).get(transfer.sourceViewId))
    .toEqual({ received_digest: transfer.expectedDigest, completed: 1 });
}

it('publishes a heavy node only after every dependency is staged and cleans staging with the business cursor', async () => {
  const stale = { ...transfer, sourceViewId: 'stale-view' };
  await stageSyncPackDependencyPage(port, { transfer: stale, afterRow: 0,
    beforeDigest: SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
    afterDigest: advanceSyncPackDependencyDigest(SYNC_PACK_DEPENDENCY_INITIAL_DIGEST, rows[0]!),
    rows: [rows[0]!] });
  await stageThrough(2);
  await expect(applySyncPackNodeSurfaceWithDbPort(port, options)).rejects.toThrow('sync_pack_dependencies_incomplete');
  expect(target.prepare('SELECT count(*) AS count FROM nodes').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_receive_progress').get()).toEqual({ count: 0 });
  await stageThrough(rows.length, 2);
  expectCompleteStaging();
  expect(await applySyncPackNodeSurfaceWithDbPort(port, options)).toMatchObject({ applied: true, toStateSeq: 1 });
  expectCurrentBody();
  expect(target.prepare(`SELECT length(data) AS bytes FROM content_blob_data
    WHERE hash = (SELECT body_blob_hash FROM nodes WHERE id = 'node-1')`).get())
    .toEqual({ bytes: 741 * 1024 });
  expect(target.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress').get()).toEqual({ cursor_state_seq: 1 });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 0 });
  expect(target.prepare("SELECT source_view_id FROM sync_pack_retired_source_views WHERE source_view_id = 'stale-view'").get())
    .toEqual({ source_view_id: 'stale-view' });
  expect(await applySyncPackNodeSurfaceWithDbPort(port, { ...options, currentCursor: 1 })).toMatchObject({ applied: false });
});

it('rolls back the business result and preserves staged dependencies if cursor persistence fails', async () => {
  await stageThrough();
  target.exec(`CREATE TRIGGER fail_cursor BEFORE INSERT ON sync_pack_receive_progress
    BEGIN SELECT RAISE(ABORT, 'injected_cursor_failure'); END;`);
  await expect(applySyncPackNodeSurfaceWithDbPort(port, options)).rejects.toThrow('injected_cursor_failure');
  expect(target.prepare('SELECT count(*) AS count FROM nodes').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM content_blob_data').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM inc.node_sync_versions').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 45 });
  target.exec('DROP TRIGGER fail_cursor');
  expect(await applySyncPackNodeSurfaceWithDbPort(port, options)).toMatchObject({ applied: true });
});

it.each([
  { content: 'local text', dirty: 0, deleted: null },
  { content: '', dirty: 1, deleted: null }
])('preserves a protected local projection: %j', async ({ content, dirty, deleted }) => {
  await stageThrough();
  await applySyncPackNodeSurfaceWithDbPort(port, options);
  target.prepare(`UPDATE nodes SET content = ?, body_blob_hash = NULL,
    sync_dirty = ?, deleted_at = ? WHERE id = 'node-1'`).run(content, dirty, deleted);
  // Re-run the per-pack projection itself: replay normally bypasses the entire apply stage.
  const { reconcileSyncPackInlineBodies } = await import('../../lib/core/sync/syncPackBodyProjection.js');
  await port.transaction((tx) => reconcileSyncPackInlineBodies(tx, 'inc', false));
  expect(target.prepare(`SELECT content, body_blob_hash FROM nodes WHERE id = 'node-1'`).get())
    .toEqual({ content, body_blob_hash: null });
});

it('rehydrates a removed node body while preserving its deletion state', async () => {
  await stageThrough();
  await applySyncPackNodeSurfaceWithDbPort(port, options);
  target.prepare(`UPDATE nodes SET content = '', body_blob_hash = NULL,
    deleted_at = '2026-09-29' WHERE id = 'node-1'`).run();
  const { reconcileSyncPackInlineBodies } = await import('../../lib/core/sync/syncPackBodyProjection.js');
  await port.transaction((tx) => reconcileSyncPackInlineBodies(tx, 'inc', false));
  expectCurrentBody('2026-09-29');
});

it('delivers a stable SQLite history across both source and receiver restart, then publishes it', async () => {
  const sourcePath = path.join(root, 'source.db');
  createIncomingPack(sourcePath);
  const source = new Database(sourcePath);
  source.exec(`DELETE FROM node_sync_versions; UPDATE nodes SET current_version_id = 'v23';
    CREATE TABLE sync_state_sequence (singleton_id INTEGER PRIMARY KEY, source_epoch TEXT, high_water INTEGER);
    INSERT INTO sync_state_sequence VALUES (1, 'source-test', 1);`);
  for (const row of rows) {
    const data = JSON.parse(row.json) as Record<string, unknown>;
    source.prepare(`INSERT INTO ${row.table} (${Object.keys(data).join(',')})
      VALUES (${Object.keys(data).map(() => '?').join(',')})`).run(...Object.values(data));
  }
  const viewPath = path.join(root, 'view.db');
  let view = await createSyncPackSourceView(source, viewPath);
  const args = { view, objectType: 'node' as const, objectId: 'node-1',
    budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 } };
  try {
    transfer = { ...transfer, sourceViewId: view.sourceViewId, ...describeSyncPackDependencySource(args) };
    target.prepare(`UPDATE inc.pack_manifest SET value = json_set(value, '$.dependency_transfers', json(?))`)
      .run(JSON.stringify([transfer]));
    const first = iterateSyncPackDependencyPages(args).next().value!;
    let nextRow = first.length;
    let digest = first.reduce(advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST);
    const page = { transfer, rows: first, afterRow: 0,
      beforeDigest: SYNC_PACK_DEPENDENCY_INITIAL_DIGEST, afterDigest: digest };
    await stageSyncPackDependencyPage(port, page);
    target.close();
    target = new Database(path.join(root, 'target.db'));
    target.pragma('foreign_keys = ON');
    port = createBetterSqliteDbPort(target);
    await port.run('ATTACH DATABASE ? AS inc', [path.join(root, 'incoming.db')]);
    expect(await stageSyncPackDependencyPage(port, page)).toMatchObject({ replay: true, nextRow });
    const identity = { ...view };
    view.close();
    source.exec(`INSERT INTO node_sync_versions (version_id,object_id,parent_version_id,host_name,
      created_at,content_hash,snapshot_json,body_text)
      SELECT 'v24',object_id,'v23',host_name,'2026-09-30','hash-v24',snapshot_json,'new live edit'
      FROM node_sync_versions WHERE version_id='v23';
      INSERT INTO node_sync_version_parents VALUES ('v24','v23',0);
      UPDATE nodes SET current_version_id='v24' WHERE id='node-1';
      UPDATE sync_object_state SET state_seq=3,content_hash='hash-v24' WHERE object_type='node';
      UPDATE sync_state_sequence SET high_water = 3;`);
    view = openSyncPackSourceView(viewPath, identity);
    const last = first.at(-1)!;
    for (const resumed of iterateSyncPackDependencyPages({ ...args, view,
      after: { table: last.table, position: last.key } })) {
      const afterDigest = resumed.reduce(advanceSyncPackDependencyDigest, digest);
      const result = await stageSyncPackDependencyPage(port, { transfer, rows: resumed,
        afterRow: nextRow, beforeDigest: digest, afterDigest });
      nextRow = result.nextRow;
      digest = afterDigest;
    }
    expect(nextRow).toBe(45);
    expectCompleteStaging();
    expect(await applySyncPackNodeSurfaceWithDbPort(port, options)).toMatchObject({ applied: true });
    expectCurrentBody();
    expect(target.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress').get())
      .toEqual({ cursor_state_seq: 1 });
  } finally { view.close(); source.close(); }
});
