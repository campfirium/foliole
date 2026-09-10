import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import {
  restoreHtmlOrphanRetirement,
  runHtmlOrphanRetirement
} from '../../scripts/desktop/html-orphan-retirement-cli.js';

import { finalizeDesktopAttachmentRetirement } from './attachmentRetirementJournal.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture(bytes = '<!doctype html><title>wrong</title>') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-html-retirement-'));
  roots.push(root);
  const assets = path.join(root, 'Assets');
  const database = path.join(root, 'foliole.db');
  const preflight = path.join(root, 'preflight.json');
  fs.mkdirSync(assets);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(assets, contentHash), bytes);
  fs.writeFileSync(path.join(assets, 'different-neighbor'), 'keep');
  const sqlite = new Database(database);
  sqlite.exec(`
    CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
      created_at TEXT, pdf_index_status TEXT, pdf_indexed_at TEXT, pdf_index_error TEXT,
      pdf_index_version INTEGER, pdf_index_attempt INTEGER);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT,
      size_bytes INTEGER, mime_type TEXT, availability TEXT, source_host_name TEXT, created_at TEXT,
      cached_at TEXT, last_verified_at TEXT);
    CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT);
    CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER UNIQUE,
      current_version_id TEXT, content_hash TEXT, last_modified_by_host_name TEXT, updated_at TEXT,
      deleted_at TEXT, sync_dirty INTEGER, PRIMARY KEY (object_type, object_id));
    PRAGMA user_version = 84;
  `);
  sqlite.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)')
    .run(contentHash, 'wrong.webp', 'image/webp', bytes.length, '2026-01-01T00:00:00.000Z');
  sqlite.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)')
    .run(contentHash, contentHash, contentHash, bytes.length, 'image/webp', 'cached', '2026-01-01T00:00:00.000Z');
  sqlite.close();
  const item = {
    aliases: [{ kind: 'approved_html', name: contentHash, sha256: contentHash }], attachmentId: contentHash,
    decision: 'html_orphan_delete', detectedKind: 'approved_html',
    references: { externalDocuments: [], nodeAttachments: [], nodeBodies: [], nodeSyncVersions: [], pdfPageCount: 0 },
    residualReasons: [], row: { attachment_id: contentHash, attachment_mime_type: 'image/webp',
      blob_mime_type: 'image/webp', content_hash: contentHash, storage_key: contentHash }
  };
  fs.writeFileSync(preflight, JSON.stringify({ input: { assetsDir: assets, databasePath: database },
    plan: { items: [item], residualBlockers: [] }, productionState: { unchanged: true }, version: 2 }));
  return { assets, contentHash, database, preflight };
}

it('retires only the preflight-bound HTML identity and preserves a different neighbor', async () => {
  const target = fixture();
  const result = await runHtmlOrphanRetirement(target);
  expect(result).toMatchObject({ beforeVersion: 84, itemCount: 1, resultStatus: 'verified' });
  expect(fs.existsSync(path.join(target.assets, target.contentHash))).toBe(false);
  expect(fs.readFileSync(path.join(target.assets, 'different-neighbor'), 'utf8')).toBe('keep');
  const sqlite = new Database(target.database, { readonly: true });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(85);
  expect(sqlite.prepare('SELECT * FROM attachments').all()).toEqual([]);
  expect(sqlite.prepare('SELECT attachment_id, content_hash, storage_key, mime_type FROM attachment_sync_tombstones').get())
    .toEqual({ attachment_id: target.contentHash, content_hash: target.contentHash,
      storage_key: target.contentHash, mime_type: 'image/webp' });
  expect(sqlite.prepare('SELECT library_scope, stage FROM attachment_retirement_obligations').get()).toEqual({
    library_scope: target.database,
    stage: 'verified'
  });
  sqlite.close();
  const journal = JSON.parse(fs.readFileSync(result.journalPath, 'utf8')) as { stage_history: string[] };
  expect(journal.stage_history).toEqual(['planned', 'targets_prepared', 'database_committed', 'verified']);
  finalizeDesktopAttachmentRetirement(result.journalPath);
  const finalized = JSON.parse(fs.readFileSync(result.journalPath, 'utf8')) as { stage: string; stage_history: string[] };
  expect(finalized).toMatchObject({ stage: 'finalized',
    stage_history: ['planned', 'targets_prepared', 'database_committed', 'verified', 'finalized'] });
});

it('blocks before database mutation when the staged source identity drifted', async () => {
  const target = fixture();
  fs.writeFileSync(path.join(target.assets, target.contentHash), 'changed');
  await expect(runHtmlOrphanRetirement(target)).rejects.toThrow('source hash mismatch');
  const sqlite = new Database(target.database, { readonly: true });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(84);
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get()).toEqual({ count: 1 });
  sqlite.close();
});

it('restores exact database rows, schema version, and staged bytes after failed acceptance', async () => {
  const target = fixture();
  const before = new Database(target.database);
  before.prepare(`INSERT INTO sync_object_state VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('attachment', target.contentHash, 7, 'old-version', 'old-hash', 'Mac',
      '2026-01-01T00:00:00.000Z', null, 1);
  before.close();
  const result = await runHtmlOrphanRetirement(target);
  await restoreHtmlOrphanRetirement(target.database, result.journalPath);
  expect(fs.readFileSync(path.join(target.assets, target.contentHash), 'utf8'))
    .toBe('<!doctype html><title>wrong</title>');
  const restored = new Database(target.database, { readonly: true });
  expect(restored.pragma('user_version', { simple: true })).toBe(84);
  expect(restored.prepare('SELECT id, mime_type FROM attachments').get())
    .toEqual({ id: target.contentHash, mime_type: 'image/webp' });
  expect(restored.prepare("SELECT state_seq, content_hash, deleted_at FROM sync_object_state WHERE object_type = 'attachment'").get())
    .toEqual({ state_seq: 7, content_hash: 'old-hash', deleted_at: null });
  expect(restored.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'attachment_%tombstone%' OR name = 'attachment_retirement_obligations'").all())
    .toEqual([]);
  restored.close();
  const journal = JSON.parse(fs.readFileSync(result.journalPath, 'utf8')) as { stage_history: string[] };
  expect(journal.stage_history.at(-1)).toBe('restored');
});
