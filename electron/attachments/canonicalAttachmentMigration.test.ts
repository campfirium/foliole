// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-canonical-migration';
let mockedDocumentsDir = '/tmp/foliole-canonical-migration-documents';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
  app_config_dir: path.join(mockedAppDataDir, 'config'), documents_dir: mockedDocumentsDir,
  app_log_dir: path.join(mockedAppDataDir, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { finalizeCanonicalAttachmentMigration, runCanonicalAttachmentMigration } from './canonicalAttachmentMigration.js';

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-canonical-migration-'));
  mockedAppDataDir = path.join(root, 'app-data');
  mockedDocumentsDir = path.join(root, 'documents');
  initializeDatabase();
});

afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

function seed(bytes: Buffer, storageKey: string) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare('INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('attachment-1', 'legacy.jpeg', 'image/jpeg', bytes.length, '2026-09-10T00:00:00.000Z');
  sqlite.prepare(`INSERT INTO attachment_blobs
    (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('attachment-1', hash, storageKey, bytes.length, 'image/jpeg', 'local', '2026-09-10T00:00:00.000Z');
  return hash;
}

it('dry-runs without mutation, then prepares, commits, stages, resumes, and finalizes', async () => {
  const assetsDir = path.join(root, 'Assets');
  const journalPath = path.join(root, 'journal.json');
  await fs.mkdir(assetsDir);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('jpeg-fixture')]);
  const hash = seed(bytes, hashPlaceholder(bytes));
  await fs.writeFile(path.join(assetsDir, hash), bytes);
  await fs.writeFile(path.join(assetsDir, 'unknown-file'), 'keep');
  const args = { assetsDir, journalPath, sqlite: openDatabaseConnection().sqlite };

  const dryRun = runCanonicalAttachmentMigration({ ...args, dryRun: true });
  expect(dryRun.residualBlockers).toEqual([]);
  await expect(fs.access(journalPath)).rejects.toThrow();
  runCanonicalAttachmentMigration(args);
  expect(JSON.parse(await fs.readFile(journalPath, 'utf8')).stage).toBe('verified');
  await expect(fs.readFile(path.join(assetsDir, `${hash}.jpg`))).resolves.toEqual(bytes);
  await expect(fs.readFile(path.join(assetsDir, 'unknown-file'), 'utf8')).resolves.toBe('keep');
  expect(openDatabaseConnection().sqlite.prepare('SELECT storage_key FROM attachment_blobs').get())
    .toEqual({ storage_key: `${hash}.jpg` });
  runCanonicalAttachmentMigration(args);
  finalizeCanonicalAttachmentMigration(journalPath);
  expect(JSON.parse(await fs.readFile(journalPath, 'utf8')).stage).toBe('finalized');
});

it('blocks before database commit when a canonical target has different bytes', async () => {
  const assetsDir = path.join(root, 'Assets-conflict');
  const journalPath = path.join(root, 'conflict.json');
  await fs.mkdir(assetsDir);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('source')]);
  const hash = seed(bytes, hashPlaceholder(bytes));
  await fs.writeFile(path.join(assetsDir, hash), bytes);
  await fs.writeFile(path.join(assetsDir, `${hash}.jpg`), 'wrong');
  expect(() => runCanonicalAttachmentMigration({ assetsDir, journalPath, sqlite: openDatabaseConnection().sqlite }))
    .toThrow('canonical_attachment_target_conflict');
  expect(openDatabaseConnection().sqlite.prepare('SELECT storage_key FROM attachment_blobs').get())
    .toEqual({ storage_key: hash });
});

it('repairs detected image metadata and retires an unreferenced HTML attachment', async () => {
  const assetsDir = path.join(root, 'Assets-repair');
  const journalPath = path.join(root, 'repair.json');
  await fs.mkdir(assetsDir);
  const sqlite = openDatabaseConnection().sqlite;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
  const html = Buffer.from('<!DOCTYPE html><html>retire</html>');
  const rows = [
    { bytes: png, id: 'repair-image', mime: 'image/jpeg' },
    { bytes: html, id: 'retire-html', mime: 'image/png' }
  ];
  for (const row of rows) {
    const hash = createHash('sha256').update(row.bytes).digest('hex');
    sqlite.prepare('INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(row.id, row.id, row.mime, row.bytes.length, '2026-09-10T00:00:00.000Z');
    sqlite.prepare(`INSERT INTO attachment_blobs
      (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(row.id, hash, row.id, row.bytes.length, row.mime, 'local', '2026-09-10T00:00:00.000Z');
    await fs.writeFile(path.join(assetsDir, row.id), row.bytes);
  }

  runCanonicalAttachmentMigration({ assetsDir, journalPath, sqlite });
  expect(sqlite.prepare('SELECT mime_type FROM attachments WHERE id = ?').get('repair-image'))
    .toEqual({ mime_type: 'image/png' });
  expect(sqlite.prepare('SELECT storage_key, mime_type FROM attachment_blobs WHERE attachment_id = ?')
    .get('repair-image')).toMatchObject({ mime_type: 'image/png', storage_key: expect.stringMatching(/\.png$/) });
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM attachments WHERE id = ?').get('retire-html'))
    .toEqual({ count: 0 });
  finalizeCanonicalAttachmentMigration(journalPath);
});

function hashPlaceholder(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
