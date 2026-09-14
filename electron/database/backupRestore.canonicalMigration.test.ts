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

import { CANONICAL_ATTACHMENT_MIGRATION_ID } from '../attachments/canonicalAttachmentMigration.js';

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

it('runs the normal canonical migration after restoring a database without its completion record', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('restore-canonical')]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const connection = openDatabaseConnection();
  const assetsDir = path.join(mockedAppDataDir, 'Foliole', 'Assets');
  await fs.writeFile(path.join(assetsDir, `${hash}.jpg`), bytes);
  connection.sqlite.prepare('DELETE FROM data_migration_state WHERE migration_id = ?')
    .run(CANONICAL_ATTACHMENT_MIGRATION_ID);
  seedLegacyAttachment(hash, bytes.length);
  const backupPath = path.join(tempRoot, 'pre-canonical.db');
  await connection.sqlite.backup(backupPath);

  initializeDatabase();
  expect(readStorageKey()).toBe(`${hash}.jpg`);

  await restoreApplicationDatabaseBackup({ sourcePath: backupPath });

  expect(readStorageKey()).toBe(`${hash}.jpg`);
  expect(readBody()).toContain(`asset://${hash}.jpg`);
  expect(openDatabaseConnection().sqlite.prepare(
    'SELECT status FROM data_migration_state WHERE migration_id = ?'
  ).get(CANONICAL_ATTACHMENT_MIGRATION_ID)).toEqual({ status: 'completed' });
});

function seedLegacyAttachment(hash: string, sizeBytes: number) {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare(`INSERT INTO attachments
    (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(hash, 'legacy.jpg', 'image/jpeg', sizeBytes, '2026-09-14T00:00:00.000Z');
  sqlite.prepare(`INSERT INTO attachment_blobs
    (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(hash, hash, hash, sizeBytes, 'image/jpeg', 'cached', '2026-09-14T00:00:00.000Z');
  upsertNodeSnapshot({
    anchorLink: null, content: `![legacy](asset://${hash})`, createdAt: '2026-09-14T00:00:00.000Z',
    isTitleManual: true, kind: 'topic', nodeId: 'node-legacy', parentNodeId: null, position: 0,
    reveal: null, title: 'Legacy', updatedAt: '2026-09-14T00:00:00.000Z'
  });
  sqlite.prepare(`INSERT INTO node_attachments
    (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-legacy', hash, 'image');
}

function readStorageKey() {
  return (openDatabaseConnection().sqlite.prepare(
    "SELECT storage_key FROM attachment_blobs WHERE attachment_id = content_hash"
  ).get() as { storage_key: string }).storage_key;
}

function readBody() {
  const row = openDatabaseConnection().sqlite.prepare(`SELECT cbd.data
    FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    WHERE n.id = 'node-legacy'`).get() as { data: Buffer };
  return row.data.toString('utf8');
}
