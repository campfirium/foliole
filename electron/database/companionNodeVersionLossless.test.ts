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
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.js';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.js';
import { requireResolvedNodeBody } from '../../lib/core/database/nodeBodyResolution.js';
import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { projectNodeResourceLinks, serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
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
const pdfHash = 'a'.repeat(64);

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-version-lossless-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await initializeDatabase();
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
    body_blob_hash: hashTextBody('Version two'),
    content_hash: versionTwo.content_hash,
    snapshot_json: JSON.stringify(versionTwo.snapshot),
    state_hash: versionTwo.content_hash
  });
  const storedSource = loadNodeSyncVersionSource('folder-1')!;
  const resolvedBody = requireResolvedNodeBody(storedSource);
  expect(computeNodeSyncVersionHash({ ...storedSource, content: resolvedBody.content }, 'folder-1'))
    .toBe(versionTwo.content_hash);

  const desktopTarget = createTargetDatabase();
  const desktopPort = createBetterSqliteDbPort(desktopTarget, { name: 'lossless-desktop-target' });
  await applySyncNodesWithDbPort(desktopPort, [versionOne], { enqueueSearchInvalidations: false });
  desktopTarget.exec('CREATE TABLE IF NOT EXISTS node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);');
  desktopTarget.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)')
    .run('folder-1', 91);
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
    `UPDATE nodes SET resource_references = ? WHERE id = 'folder-1'`
  ).run(serializeNodeResourceReferences([
    { storage_key: `${pdfHash}.pdf`, role: 'reference', original_name: 'Paper.pdf' }
  ]));
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
    `SELECT content_hash, json_extract(snapshot_json, '$.body_blob_hash') AS body_blob_hash,
     json_remove(snapshot_json, '$.body_blob_hash') AS snapshot_json
     FROM node_sync_versions WHERE version_id = ?`
  ).get(versionId) as { content_hash: string; body_blob_hash: string; snapshot_json: string };
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
  database.exec(ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
  return database;
}

function readTargetState(database: Database.Database) {
  const node = database.prepare(
    `SELECT ${buildNodeBodyContentSql()} AS content, n.shelved_at, n.manual_child_order, n.import_source_fingerprint,
       n.import_content_fingerprint, o.position
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     LEFT JOIN node_order o ON o.node_id = n.id WHERE n.id = 'folder-1'`
  ).get();
  const resources = database.prepare(
    `SELECT resource_references FROM nodes WHERE id = 'folder-1'`
  ).get() as { resource_references: string };
  const attachments = projectNodeResourceLinks(resources.resource_references);
  return { ...node as object, attachments, resource_references: resources.resource_references };
}

function expectedTargetState(content: string) {
  return {
    attachments: [{ attachment_id: pdfHash, role: 'reference' }],
    content,
    import_content_fingerprint: 'content-a',
    import_source_fingerprint: 'source-a',
    manual_child_order: '["child-b","child-a"]',
    position: 91,
    resource_references: serializeNodeResourceReferences([
      { storage_key: `${pdfHash}.pdf`, role: 'reference', original_name: 'Paper.pdf' }
    ]),
    shelved_at: '2026-07-10T00:00:00.000Z'
  };
}
