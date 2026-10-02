// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-restore-canonical-migration';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs'),
    documents_dir: mockedAppDataDir
  })
}));

import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopResourceSchemaStatements.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';

import { restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

let tempRoot = '';

it('restores v127 legacy storage and duplicate previews through the normal backup upgrade', async () => {
  const db = openDatabaseConnection().sqlite;
  const full = '# Recovery\n\n' + 'Complete cached source body. '.repeat(30);
  db.exec(`CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);
    CREATE TABLE virtual_folders (id TEXT PRIMARY KEY, description TEXT);
    CREATE TABLE virtual_folder_items (id TEXT PRIMARY KEY);
    INSERT INTO virtual_folders VALUES ('unused','unused description');
    INSERT INTO keep_import_items (rule_id,source_path,source_mtime_ms,source_size_bytes,
      first_seen_at,last_seen_at,last_status,source_state,local_node_state)
    VALUES ('rule','unavailable.md',1,2,'then','now','blocked_deleted','present','locally_deleted');
    PRAGMA user_version = 127;`);
  db.prepare(`INSERT INTO keep_import_item_cache VALUES ('rule','unavailable.md','Recovery',?,?,1,2,'then','unavailable')`)
    .run(full, full);
  const order = db.prepare('SELECT * FROM parent_child_order ORDER BY parent_id').all();
  const backupPath = path.join(tempRoot, 'legacy-cache.db');
  await db.backup(backupPath);
  initializeDatabase();
  await restoreApplicationDatabaseBackup({ sourcePath: backupPath });
  const restored = openDatabaseConnection().sqlite;
  expect(restored.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(restored.prepare(`SELECT name FROM sqlite_master
    WHERE name IN ('node_order','virtual_folders','virtual_folder_items')`).all()).toEqual([]);
  expect(restored.prepare('SELECT * FROM parent_child_order ORDER BY parent_id').all()).toEqual(order);
  const cache = restored.prepare('SELECT content,content_preview,refreshed_at,refresh_error FROM keep_import_item_cache')
    .get() as { content: string; content_preview: string; refreshed_at: string; refresh_error: string };
  expect(cache).toMatchObject({ content: full, refreshed_at: 'then', refresh_error: 'unavailable' });
  expect(cache.content_preview.length).toBeLessThanOrEqual(201);
  expect(cache.content_preview).toContain('Complete cached source body.');
  const search = restored.prepare("SELECT content,metadata FROM stored_source_search WHERE source_key='rule:unavailable.md'")
    .get() as { content: string; metadata: string };
  expect(search.content).toBe(full);
  expect(JSON.parse(search.metadata).contentPreview).toBe(cache.content_preview);
});

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-canonical-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it.each(['canonical', 'bare-hash', 'jpeg'].flatMap((legacyName) => [true, false].map((canonicalFile) => ({ legacyName, canonicalFile }))))(
  'upgrades and restores $legacyName references with canonical file=$canonicalFile', async ({ legacyName, canonicalFile }) => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('restore-canonical')]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const connection = openDatabaseConnection();
  const assetsDir = path.join(mockedAppDataDir, 'Foliole', 'Assets');

  connection.sqlite.exec(`CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY,
    content_hash TEXT, storage_key TEXT, size_bytes INTEGER, mime_type TEXT, availability TEXT, created_at TEXT);
    PRAGMA user_version = 97;`);
  for (const sql of DESKTOP_RESOURCE_SCHEMA_STATEMENTS) connection.sqlite.exec(sql);
  const storageKey = legacyName === 'bare-hash' ? hash : `${hash}.${legacyName === 'jpeg' ? 'jpeg' : 'jpg'}`;
  const existingName = canonicalFile ? `${hash}.jpg` : storageKey;
  await fs.writeFile(path.join(assetsDir, existingName), bytes);
  seedLegacyAttachment(hash, bytes.length, storageKey);
  prepareLegacyOrder();
  const backupPath = path.join(tempRoot, 'pre-retirement.db');
  await connection.sqlite.backup(backupPath);
  initializeDatabase();
  expect(readRetiredTable()).toBeUndefined();
  expect(readBody()).toContain(`asset://${hash}.jpg`);
  expect(readResourceReferences()).toEqual([{ storage_key: `${hash}.jpg`, role: 'image', original_name: 'legacy.jpg' }]);
  await restoreApplicationDatabaseBackup({ sourcePath: backupPath });
  expect(readRetiredTable()).toBeUndefined();
  expect(readBody()).toContain(`asset://${hash}.jpg`);
  expect(readResourceReferences()).toEqual([{ storage_key: `${hash}.jpg`, role: 'image', original_name: 'legacy.jpg' }]);
  await expect(fs.readFile(path.join(assetsDir, `${hash}.jpg`))).resolves.toEqual(bytes);
  expect((await fs.readdir(assetsDir)).sort()).toEqual([...new Set([`${hash}.jpg`, existingName])].sort());
  await expect(fs.readFile(path.join(assetsDir, existingName))).resolves.toEqual(bytes);
  initializeDatabase();
  expect(readRetiredTable()).toBeUndefined();
  expect(readBody()).toContain(`asset://${hash}.jpg`);
  const versions = openDatabaseConnection().sqlite.prepare(
    'SELECT body_text FROM node_sync_versions WHERE object_id = ?').all('node-legacy') as Array<{ body_text: string }>;
  expect(versions.some((row) => row.body_text.includes(`asset://${storageKey}`))).toBe(true);
  const head = openDatabaseConnection().sqlite.prepare(
    'SELECT v.body_text FROM node_sync_versions v JOIN nodes n ON n.current_version_id = v.version_id WHERE n.id = ?'
  ).get('node-legacy') as { body_text: string };
  expect(head.body_text).toContain(`asset://${hash}.jpg`);
});

function prepareLegacyOrder() {
  const { driver, sqlite } = openDatabaseConnection();
  const nodeOrder = loadDerivedNodeOrder(driver);
  sqlite.exec('CREATE TABLE IF NOT EXISTS node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);');
  sqlite.exec(`DELETE FROM node_order;
    DROP TABLE parent_child_order;
    DELETE FROM sync_object_state WHERE object_type = 'parent_child_order';`);
  const insert = sqlite.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');
  nodeOrder.forEach((id, position) => insert.run(id, position));
}

function seedLegacyAttachment(hash: string, sizeBytes: number, storageKey: string) {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare(`INSERT INTO attachments
    (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(hash, 'legacy.jpg', 'image/jpeg', sizeBytes, '2026-09-14T00:00:00.000Z');
  sqlite.prepare(`INSERT INTO attachment_blobs
    (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(hash, hash, storageKey, sizeBytes, 'image/jpeg', 'cached', '2026-09-14T00:00:00.000Z');
  upsertNodeSnapshot({
    anchorLink: null, content: `![legacy](asset://${storageKey})`, createdAt: '2026-09-14T00:00:00.000Z',
    isTitleManual: true, kind: 'topic', nodeId: 'node-legacy', parentNodeId: null, position: 0,
    reveal: null, title: 'Legacy', updatedAt: '2026-09-14T00:00:00.000Z'
  });
  const originalVersion = flushNodeSyncVersion('node-legacy');
  sqlite.prepare('INSERT INTO node_version_local_holds (hold_id, object_id, version_id, created_at) VALUES (?, ?, ?, ?)')
    .run('fixture:original', 'node-legacy', originalVersion, '2026-09-14T00:00:00.000Z');
  sqlite.prepare(`INSERT INTO node_attachments
    (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-legacy', hash, 'image');
}

function readRetiredTable() {
  return openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get();
}

function readResourceReferences() {
  const row = openDatabaseConnection().sqlite.prepare('SELECT resource_references FROM nodes WHERE id = ?')
    .get('node-legacy') as { resource_references: string };
  return JSON.parse(row.resource_references);
}

function readBody() {
  const row = openDatabaseConnection().sqlite.prepare(`SELECT cbd.data
    FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    WHERE n.id = 'node-legacy'`).get() as { data: Buffer };
  return row.data.toString('utf8');
}

it.each([false, true])('rejects unsupported backups even with startup schema skip=%s', async (skipSchema) => {
  const connection = openDatabaseConnection();
  seedCurrentTopic();
  connection.sqlite.pragma('user_version = 27');
  const backupPath = path.join(tempRoot, 'unsupported.db');
  await connection.sqlite.backup(backupPath);
  connection.sqlite.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
  if (skipSchema) vi.stubEnv('FOLIOLE_SKIP_STARTUP_SCHEMA_INIT', '1');
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backupPath }))
    .rejects.toThrow('Your current library has been restored');
  expect(openDatabaseConnection().sqlite.prepare('SELECT title FROM nodes WHERE id = ?').get('keep-current'))
    .toEqual({ title: 'Current library' });
});

function seedCurrentTopic() {
  upsertNodeSnapshot({ nodeId: 'keep-current', parentNodeId: null, kind: 'topic', title: 'Current library',
    isTitleManual: true, content: 'Keep this', reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' });
}

it('rolls back when the required canonical attachment contains different bytes', async () => {
  const connection = openDatabaseConnection();
  seedCurrentTopic();
  const bytes = Buffer.from('original attachment');
  const hash = createHash('sha256').update(bytes).digest('hex');
  connection.sqlite.exec(`CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY,
    content_hash TEXT, storage_key TEXT, size_bytes INTEGER, mime_type TEXT, availability TEXT, created_at TEXT);
    PRAGMA user_version = 97;`);
  for (const sql of DESKTOP_RESOURCE_SCHEMA_STATEMENTS) connection.sqlite.exec(sql);
  seedLegacyAttachment(hash, bytes.length, hash);
  prepareLegacyOrder();
  const backupPath = path.join(tempRoot, 'wrong-attachment.db');
  await connection.sqlite.backup(backupPath);
  connection.sqlite.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
  connection.sqlite.prepare('UPDATE nodes SET title = ? WHERE id = ?').run('Current after backup', 'keep-current');
  const file = path.join(mockedAppDataDir, 'Foliole', 'Assets', `${hash}.jpg`);
  await fs.writeFile(file, 'different bytes');
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backupPath }))
    .rejects.toThrow('Your current library has been restored');
  expect(openDatabaseConnection().sqlite.prepare('SELECT title FROM nodes WHERE id = ?').get('keep-current'))
    .toEqual({ title: 'Current after backup' });
  await expect(fs.readFile(file, 'utf8')).resolves.toBe('different bytes');
});
