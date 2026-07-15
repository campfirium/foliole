// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-node-version-lossless';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.js';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { computeNodeSyncVersionHash, loadNodeSyncVersionSource } from './nodeSyncVersionSource.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';
const targetDatabases: Database.Database[] = [];

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-version-lossless-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  seedSourceFolder('Version one', '2026-07-11T01:00:00.000Z');
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET current_version_id = ?, sync_dirty = 0 WHERE id = ?')
    .run('desktop#base', 'folder-1');
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
});

afterEach(async () => {
  closeDatabaseConnection();
  targetDatabases.splice(0).forEach((database) => database.close());
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('rebuilds and fast-forwards complete producer versions through the BetterSQLite DbPort', async () => {
  const versionOne = await produceSourceVersion();
  await applyToSource(versionOne);
  const versionTwo = await produceSourceVersion({
    content: 'Version two',
    updatedAt: '2026-07-11T02:00:00.000Z'
  });
  await applyToSource(versionTwo);

  expect(versionTwo.parent_version_id).toBe(versionOne.version_id);
  expect(readPersistedSourceVersion(versionTwo.version_id!)).toEqual({
    content_hash: versionTwo.content_hash,
    snapshot_json: JSON.stringify(versionTwo.snapshot),
    state_hash: versionTwo.content_hash
  });
  expect(computeNodeSyncVersionHash(loadNodeSyncVersionSource('folder-1')!, 'folder-1'))
    .toBe(versionTwo.content_hash);

  const desktopTarget = createTargetDatabase();
  const desktopPort = createBetterSqliteDbPort(desktopTarget, { name: 'lossless-desktop-target' });
  await applySyncNodesWithDbPort(desktopPort, [versionOne], { enqueueSearchInvalidations: false });
  await applySyncNodesWithDbPort(desktopPort, [versionTwo], { enqueueSearchInvalidations: false });
  expect(readTargetState(desktopTarget)).toEqual(expectedTargetState('Version two'));

});

function seedSourceFolder(content: string, updatedAt: string) {
  upsertNodeSnapshot({
    anchorLink: null,
    content,
    createdAt: '2026-07-11T00:00:00.000Z',
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'folder',
    manualChildOrder: ['child-b', 'child-a'],
    nodeId: 'folder-1',
    parentNodeId: null,
    position: 37,
    reveal: null,
    shelvedAt: '2026-07-10T00:00:00.000Z',
    title: 'Folder',
    updatedAt
  });
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare(
    `INSERT OR IGNORE INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES ('attachment-1', 'Paper.pdf', 'application/pdf', 128, '2026-07-11T00:00:00.000Z')`
  ).run();
  sqlite.prepare(
    `INSERT OR IGNORE INTO node_attachments (node_id, attachment_id, role)
     VALUES ('folder-1', 'attachment-1', 'reference')`
  ).run();
  sqlite.prepare(
    `UPDATE nodes SET import_source_fingerprint = 'source-a', import_content_fingerprint = 'content-a'
     WHERE id = 'folder-1'`
  ).run();
}

async function produceSourceVersion(overrides: { content: string; updatedAt: string } | null = null) {
  const node = loadWorkspaceSnapshot({ includeBody: true })?.nodesById['folder-1'];
  if (!node) throw new Error('source folder missing');
  return toWorkspaceNativeNodeVersion({ ...node, ...(overrides ?? {}) }, 'android-device');
}

async function applyToSource(version: Awaited<ReturnType<typeof produceSourceVersion>>) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'lossless-source' });
  await applySyncNodesWithDbPort(port, [version], { enqueueSearchInvalidations: false });
}

function readPersistedSourceVersion(versionId: string) {
  const sqlite = openDatabaseConnection().sqlite;
  const version = sqlite.prepare(
    'SELECT content_hash, snapshot_json FROM node_sync_versions WHERE version_id = ?'
  ).get(versionId) as { content_hash: string; snapshot_json: string };
  const state = sqlite.prepare(
    `SELECT content_hash AS state_hash FROM sync_object_state
     WHERE object_type = 'node' AND object_id = 'folder-1'`
  ).get() as { state_hash: string };
  return { ...version, ...state };
}

function createTargetDatabase() {
  const database = new Database(':memory:');
  targetDatabases.push(database);
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(`
    CREATE TABLE content_blobs (
      hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT NOT NULL,
      compression TEXT NOT NULL, original_size_bytes INTEGER NOT NULL, stored_size_bytes INTEGER NOT NULL,
      original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, availability TEXT NOT NULL,
      created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
      VALUES ('attachment-1', 'Paper.pdf', 'application/pdf', 128, '2026-07-11T00:00:00.000Z');
  `);
  return database;
}

function readTargetState(database: Database.Database) {
  const node = database.prepare(
    `SELECT n.content, n.shelved_at, n.manual_child_order, n.import_source_fingerprint,
       n.import_content_fingerprint, o.position
     FROM nodes n LEFT JOIN node_order o ON o.node_id = n.id WHERE n.id = 'folder-1'`
  ).get();
  const attachments = database.prepare(
    `SELECT attachment_id, role FROM node_attachments WHERE node_id = 'folder-1' ORDER BY attachment_id, role`
  ).all();
  return { ...node as object, attachments };
}

function expectedTargetState(content: string) {
  return {
    attachments: [{ attachment_id: 'attachment-1', role: 'reference' }],
    content,
    import_content_fingerprint: 'content-a',
    import_source_fingerprint: 'source-a',
    manual_child_order: '["child-b","child-a"]',
    position: 37,
    shelved_at: '2026-07-10T00:00:00.000Z'
  };
}
