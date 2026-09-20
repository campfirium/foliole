// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import { retireAttachmentManifest, retireCompanionAttachmentManifest } from './attachmentManifestRetirementMigration.js';
import { computeCompanionContentHash } from './companionHostStateHashes.js';

const databases: Database.Database[] = [];
const id = 'a'.repeat(64);
const now = '2026-09-20T00:00:00.000Z';
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  db.exec(`PRAGMA user_version = 97;
    CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER, created_at TEXT);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT, mime_type TEXT, size_bytes INTEGER);
    CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT);
    CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, content_hash TEXT, sync_dirty INTEGER,
      state_seq INTEGER UNIQUE, last_modified_by_host_name TEXT, updated_at TEXT, deleted_at TEXT);`);
  db.prepare('INSERT INTO attachments VALUES (?, ?, NULL, NULL, ?)').run(id, 'image.png', now);
  db.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?, ?, ?)').run(id, id, `${id}.png`, 'image/png', 80);
  db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('article', id, 'image');
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
    .run('attachment', id, 'old-format-hash', 0, 1, 'author', now);
  return db;
}

async function migrate(db: Database.Database, host: string) {
  if (host === 'desktop') return db.transaction(() => retireAttachmentManifest(db))();
  const port = createBetterSqliteDbPort(db, { name: 'retirement-test' });
  return port.transaction((tx) => retireCompanionAttachmentManifest(tx));
}

it.each(['desktop', 'companion'])('preserves metadata and relations and republishes the metadata hash on %s', async (host) => {
  const db = fixture();
  await migrate(db, host);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").all()).toEqual([]);
  expect(db.prepare('SELECT mime_type, size_bytes FROM attachments').get()).toEqual({ mime_type: 'image/png', size_bytes: 80 });
  expect(db.prepare('SELECT attachment_id FROM node_attachments').get()).toEqual({ attachment_id: id });
  const hash = computeCompanionContentHash({ attachment_id: id, original_name: 'image.png',
    mime_type: 'image/png', size_bytes: 80, created_at: now });
  expect(db.prepare('SELECT * FROM sync_object_state').get()).toMatchObject({ content_hash: hash, sync_dirty: 1,
    state_seq: 2, last_modified_by_host_name: 'author', updated_at: now });
  await migrate(db, host);
  expect(db.prepare('SELECT state_seq FROM sync_object_state').get()).toEqual({ state_seq: 2 });
});

it.each(['desktop', 'companion'])('rolls back the entire migration for an unrepresentable later row on %s', async (host) => {
  const db = fixture();
  db.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?, ?, ?)').run('orphan', id, `${id}.png`, 'image/png', 80);
  await expect(migrate(db, host)).rejects.toThrow('attachment_manifest_retirement_unrepresentable');
  expect(db.prepare('SELECT mime_type FROM attachments').get()).toEqual({ mime_type: null });
  expect(db.prepare('SELECT COUNT(*) AS count FROM attachment_blobs').get()).toEqual({ count: 2 });
  expect(db.pragma('user_version', { simple: true })).toBe(97);
});

it('refuses to discard metadata needed by a dangling business relation', async () => {
  const db = fixture();
  db.prepare('INSERT INTO pdf_page_text VALUES (?, 1)').run('missing');
  await expect(migrate(db, 'desktop')).rejects.toThrow('attachment_manifest_retirement_dangling_relation');
  expect(db.prepare('SELECT COUNT(*) AS count FROM attachment_blobs').get()).toEqual({ count: 1 });
});
