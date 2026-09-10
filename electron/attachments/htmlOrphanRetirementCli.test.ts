// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { runCanonicalAttachmentPreflight } from '../../scripts/desktop/canonical-attachment-preflight-cli.js';
import {
  restoreHtmlOrphanRetirement,
  runHtmlOrphanRetirement
} from '../../scripts/desktop/html-orphan-retirement-cli.js';

import { finalizeHtmlOrphanRetirement } from './htmlOrphanRetirementJournal.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const roots: string[] = [];

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  fs.mkdirSync(path.join(process.cwd(), '.tmp', 'artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'artifacts', 't180-retire-test-'));
  roots.push(root);
  const assets = path.join(root, 'Assets');
  const database = path.join(root, 'foliole.db');
  const preflight = path.join(root, 'preflight.json');
  fs.mkdirSync(assets);
  const bytes = Buffer.from('<!DOCTYPE html><title>wrong</title>');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(assets, contentHash), bytes);
  fs.writeFileSync(path.join(assets, 'different-neighbor'), 'keep');
  const sqlite = new BetterSqlite3(database);
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
      created_at TEXT NOT NULL);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
      content_hash TEXT, storage_key TEXT, size_bytes INTEGER, mime_type TEXT, availability TEXT, created_at TEXT);
    CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT, deleted_at TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    CREATE TABLE node_attachments (node_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      attachment_id TEXT REFERENCES attachments(id), role TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT, snapshot_json TEXT);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT);
    CREATE TABLE pdf_page_text (attachment_id TEXT REFERENCES attachments(id) ON DELETE CASCADE, page INTEGER, text TEXT);
    CREATE TABLE import_sources (source_fingerprint TEXT PRIMARY KEY, remote_import_state_json TEXT NOT NULL);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER UNIQUE,
      current_version_id TEXT, content_hash TEXT, last_modified_by_host_name TEXT, updated_at TEXT,
      deleted_at TEXT, sync_dirty INTEGER, PRIMARY KEY (object_type, object_id));
    CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, state TEXT CHECK (state = 'active'));
    PRAGMA user_version = 83;
  `);
  sqlite.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?)')
    .run(contentHash, 'wrong.webp', 'image/webp', bytes.length, '2026-01-01T00:00:00.000Z');
  sqlite.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(contentHash, contentHash, contentHash, bytes.length, 'image/webp', 'local', '2026-01-01T00:00:00.000Z');
  sqlite.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('attachment', contentHash, 7, 'old-version', 'old-hash', 'Mac', '2026-01-01T00:00:00.000Z', null, 1);
  sqlite.close();
  runCanonicalAttachmentPreflight({ assetsDir: assets, databasePath: database, outputPath: preflight });
  return { assets, bytes, contentHash, database, preflight, root };
}

it('retires only exact local HTML state without a tombstone or version change', () => {
  const target = fixture();
  const result = runHtmlOrphanRetirement(target);
  expect(result).toMatchObject({ beforeVersion: 83, itemCount: 1, resultStatus: 'verified' });
  const sqlite = new BetterSqlite3(target.database, { readonly: true });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(83);
  expect(sqlite.prepare('SELECT * FROM attachments').all()).toEqual([]);
  expect(sqlite.prepare('SELECT * FROM attachment_blobs').all()).toEqual([]);
  expect(sqlite.prepare('SELECT * FROM sync_object_state').all()).toEqual([]);
  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%tombstone%'").all()).toEqual([]);
  sqlite.close();
  expect(fs.existsSync(path.join(target.assets, target.contentHash))).toBe(false);
  expect(fs.readFileSync(path.join(target.assets, 'different-neighbor'), 'utf8')).toBe('keep');
  expect(runHtmlOrphanRetirement(target)).toMatchObject({ resultStatus: 'verified' });
  expect(finalizeHtmlOrphanRetirement(result.journalPath)).toMatchObject({ resultStatus: 'finalized' });
});

it('restores exact database rows, version, and staged bytes', () => {
  const target = fixture();
  const result = runHtmlOrphanRetirement(target);
  expect(restoreHtmlOrphanRetirement(target.database, result.journalPath)).toMatchObject({ resultStatus: 'restored' });
  const sqlite = new BetterSqlite3(target.database, { readonly: true });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(83);
  expect(sqlite.prepare('SELECT id FROM attachments').get()).toEqual({ id: target.contentHash });
  expect(sqlite.prepare("SELECT state_seq, sync_dirty FROM sync_object_state WHERE object_type='attachment'").get())
    .toEqual({ state_seq: 7, sync_dirty: 1 });
  sqlite.close();
  expect(fs.readFileSync(path.join(target.assets, target.contentHash))).toEqual(target.bytes);
});

it('automatically restores files when the database transaction fails', () => {
  const target = fixture();
  const sqlite = new BetterSqlite3(target.database);
  sqlite.exec("CREATE TRIGGER block_delete BEFORE DELETE ON attachments BEGIN SELECT RAISE(ABORT, 'blocked'); END");
  sqlite.close();
  expect(() => runHtmlOrphanRetirement(target)).toThrow('blocked');
  expect(fs.readFileSync(path.join(target.assets, target.contentHash))).toEqual(target.bytes);
  const restored = new BetterSqlite3(target.database, { readonly: true });
  expect(restored.prepare('SELECT id FROM attachments').get()).toEqual({ id: target.contentHash });
  restored.close();
});

it('blocks active groups and stale Readwise references before moving files', () => {
  const active = fixture();
  let sqlite = new BetterSqlite3(active.database);
  sqlite.exec("INSERT INTO sync_group_local_state VALUES (1, 'active')");
  sqlite.close();
  expect(() => runHtmlOrphanRetirement(active)).toThrow('no active Sync Group');
  expect(fs.existsSync(path.join(active.assets, active.contentHash))).toBe(true);

  const referenced = fixture();
  sqlite = new BetterSqlite3(referenced.database);
  sqlite.prepare('INSERT INTO import_sources VALUES (?, ?)').run('source', JSON.stringify({
    originalFile: { attachmentId: referenced.contentHash }
  }));
  sqlite.close();
  expect(() => runHtmlOrphanRetirement(referenced)).toThrow('preflight no longer matches');
  expect(fs.existsSync(path.join(referenced.assets, referenced.contentHash))).toBe(true);
});
