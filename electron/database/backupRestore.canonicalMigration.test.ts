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

import { restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-canonical-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('retires a restored representable manifest without changing article bodies or files', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('restore-canonical')]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const connection = openDatabaseConnection();
  const assetsDir = path.join(mockedAppDataDir, 'Foliole', 'Assets');
  await fs.writeFile(path.join(assetsDir, `${hash}.jpg`), bytes);
  connection.sqlite.exec(`CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY,
    content_hash TEXT, storage_key TEXT, size_bytes INTEGER, mime_type TEXT, availability TEXT, created_at TEXT);
    PRAGMA user_version = 97;`);
  seedLegacyAttachment(hash, bytes.length);
  const backupPath = path.join(tempRoot, 'pre-retirement.db');
  await connection.sqlite.backup(backupPath);
  initializeDatabase();
  expect(readRetiredTable()).toBeUndefined();
  await restoreApplicationDatabaseBackup({ sourcePath: backupPath });
  expect(readRetiredTable()).toBeUndefined();
  expect(readBody()).toContain(`asset://${hash}.jpg`);
  await expect(fs.readFile(path.join(assetsDir, `${hash}.jpg`))).resolves.toEqual(bytes);
});

function seedLegacyAttachment(hash: string, sizeBytes: number) {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare(`INSERT INTO attachments
    (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(hash, 'legacy.jpg', 'image/jpeg', sizeBytes, '2026-09-14T00:00:00.000Z');
  sqlite.prepare(`INSERT INTO attachment_blobs
    (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(hash, hash, `${hash}.jpg`, sizeBytes, 'image/jpeg', 'cached', '2026-09-14T00:00:00.000Z');
  upsertNodeSnapshot({
    anchorLink: null, content: `![legacy](asset://${hash}.jpg)`, createdAt: '2026-09-14T00:00:00.000Z',
    isTitleManual: true, kind: 'topic', nodeId: 'node-legacy', parentNodeId: null, position: 0,
    reveal: null, title: 'Legacy', updatedAt: '2026-09-14T00:00:00.000Z'
  });
  sqlite.prepare(`INSERT INTO node_attachments
    (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-legacy', hash, 'image');
}

function readRetiredTable() {
  return openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get();
}

function readBody() {
  const row = openDatabaseConnection().sqlite.prepare(`SELECT cbd.data
    FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    WHERE n.id = 'node-legacy'`).get() as { data: Buffer };
  return row.data.toString('utf8');
}
