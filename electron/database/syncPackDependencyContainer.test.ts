// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readSyncPackCursorWithDbPort } from '../../lib/core/sync/syncPackCursor.js';
import { advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
  type SyncPackDependencyPage, type SyncPackDependencyRow } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { extractSyncPackDatabaseFromFile } from '../sync/syncPackContainerReader.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { buildSyncPackDependencyPageArchive } from './syncPackDependencyPageBuilder.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from './syncPackPageBudget.js';

let root: string;
let target: Database.Database;
let port: ReturnType<typeof createBetterSqliteDbPort>;
let page: SyncPackDependencyPage;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dependency-container-'));
  target = new Database(path.join(root, 'target.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');`);
  port = createBetterSqliteDbPort(target);
  const row: SyncPackDependencyRow = { table: 'node_sync_versions', key: { key: 'v1', ordinal: -1 },
    json: JSON.stringify({ version_id: 'v1', object_id: 'article', parent_version_id: null,
      host_name: 'source', content_hash: 'hash', created_at: 'now',
      body_text: 'b'.repeat(741 * 1024), snapshot_json: '{"id":"article","content":null}' }) };
  const digest = advanceSyncPackDependencyDigest(SYNC_PACK_DEPENDENCY_INITIAL_DIGEST, row);
  page = { transfer: { groupId: 'group', peerId: 'source', sourceEpoch: 'epoch', sourceViewId: 'view',
    objectType: 'node', objectId: 'article', fromStateSeq: 0, objectStateSeq: 1,
    frontierStateSeq: 1, expectedRows: 1, expectedDigest: digest },
    afterRow: 0, beforeDigest: SYNC_PACK_DEPENDENCY_INITIAL_DIGEST, afterDigest: digest, rows: [row] };
});

afterEach(async () => { target.close(); await fs.rm(root, { force: true, recursive: true }); });

async function buildAndAttach() {
  const archivePath = path.join(root, 'page.syncpack');
  await buildSyncPackDependencyPageArchive({ page, outputPath: archivePath,
    packId: 'pack', fromPeerId: 'source', toPeerId: 'receiver' });
  const incomingPath = path.join(root, 'incoming.db');
  const manifest = await extractSyncPackDatabaseFromFile({ archivePath, outputPath: incomingPath,
    expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
    maxDatabaseBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes });
  await port.run('ATTACH DATABASE ? AS inc', [incomingPath]);
  return manifest;
}

const options = { currentCursor: 0, hostName: 'receiver', sourcePeerId: 'source',
  enqueueSearchInvalidations: false };

it('round-trips a heavy dependency through the real SQLite container and shared apply without publishing it', async () => {
  const manifest = await buildAndAttach();
  await assertSyncPackManifestMatchesDatabase(port, manifest);
  expect(await readSyncPackCursorWithDbPort(port)).toMatchObject({ dependencyPage: { rowCount: 1 } });
  expect(await applySyncPackNodeSurfaceWithDbPort(port, options)).toMatchObject({
    applied: false, toStateSeq: 0, dependencyProgress: { completed: true, nextRow: 1, replay: false } });
  expect(await applySyncPackNodeSurfaceWithDbPort(port, options)).toMatchObject({
    applied: false, toStateSeq: 0, dependencyProgress: { completed: true, nextRow: 1, replay: true } });
  expect(target.prepare('SELECT count(*) AS count FROM nodes').get()).toEqual({ count: 0 });
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_receive_progress').get()).toEqual({ count: 0 });
  expect(target.prepare(`SELECT length(json_extract(payload_json, '$.body_text')) AS bytes
    FROM sync_pack_dependency_rows`).get()).toEqual({ bytes: 741 * 1024 });
});

it('binds dependency descriptors between the outer and inner manifests', async () => {
  const manifest = await buildAndAttach();
  await expect(assertSyncPackManifestMatchesDatabase(port, { ...manifest,
    dependencyPage: { ...manifest.dependencyPage!, afterDigest: '0'.repeat(64) } }))
    .rejects.toThrow('sync_pack_inner_manifest_mismatch');
});

it('rejects a retired source epoch and leaves no staged rows', async () => {
  await buildAndAttach();
  target.exec(`INSERT INTO sync_pack_retired_source_epochs VALUES ('group', 'source', 'epoch', 'now')`);
  await expect(applySyncPackNodeSurfaceWithDbPort(port, options)).rejects.toThrow('sync_pack_source_epoch_retired');
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 0 });
});

it('rejects payload changes even when row count and container integrity are otherwise valid', async () => {
  await buildAndAttach();
  target.prepare(`UPDATE inc.sync_pack_dependency_page_rows SET row_json = ?`)
    .run(JSON.stringify({ ...page.rows[0], json: page.rows[0]!.json.replace('"hash"', '"changed"') }));
  await expect(applySyncPackNodeSurfaceWithDbPort(port, options)).rejects.toThrow('sync_pack_dependency_page_digest_mismatch');
  expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 0 });
});

it.each([113, 114])('upgrades dependency staging from schema %s while preserving existing data', (version) => {
  const desktop = new Database(':memory:');
  try {
    initializeDatabaseSchema(desktop);
    if (version === 113) desktop.exec('DROP TABLE sync_pack_dependency_rows; DROP TABLE sync_pack_dependency_transfers;');
    desktop.exec(`DROP TABLE sync_pack_retired_source_views; PRAGMA user_version = ${version};
      CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('kept');`);
    initializeDatabaseSchema(desktop);
    expect(desktop.pragma('user_version', { simple: true })).toBe(116);
    expect(desktop.prepare('SELECT value FROM preserved').get()).toEqual({ value: 'kept' });
    expect(desktop.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get()).toEqual({ count: 0 });
    expect(desktop.prepare('SELECT count(*) AS count FROM sync_pack_retired_source_views').get()).toEqual({ count: 0 });
    expect(desktop.prepare('SELECT count(*) AS count FROM sync_pack_known_fact_claims').get()).toEqual({ count: 0 });
  } finally { desktop.close(); }
});
