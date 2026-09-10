// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { runCanonicalAttachmentPreflight } from '../../scripts/desktop/canonical-attachment-preflight-cli.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function hashBytes(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createFixture() {
  fs.mkdirSync(path.join(process.cwd(), '.tmp', 'artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'artifacts', 't180-preflight-test-'));
  roots.push(root);
  const assetsDir = path.join(root, 'Assets');
  const databasePath = path.join(root, 'foliole.db');
  fs.mkdirSync(assetsDir);
  const db = new BetterSqlite3(databasePath);
  db.exec(`
    CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER, created_at TEXT);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT,
      size_bytes INTEGER, mime_type TEXT, availability TEXT, created_at TEXT);
    CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT, deleted_at TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT, snapshot_json TEXT);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT);
    CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT);
  `);
  return { assetsDir, databasePath, db, root };
}

function addAttachment(
  fixture: ReturnType<typeof createFixture>,
  id: string,
  bytes: Buffer | null,
  attachmentMime: string | null,
  blobMime = attachmentMime,
  storageKey = id
) {
  const hash = bytes ? hashBytes(bytes) : id.startsWith('missing') ? 'f'.repeat(64) : null;
  fixture.db.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?)')
    .run(id, `${id}.bin`, attachmentMime, bytes?.length ?? null, '2026-09-10T00:00:00.000Z');
  fixture.db.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, hash, storageKey, bytes?.length ?? null, blobMime, bytes ? 'local' : 'missing', '2026-09-10T00:00:00.000Z');
  if (bytes) fs.writeFileSync(path.join(fixture.assetsDir, storageKey), bytes);
  return hash;
}

function addHtml(fixture: ReturnType<typeof createFixture>, id: string, suffix: string) {
  return addAttachment(fixture, id, Buffer.from(`<!DOCTYPE html><html>${suffix}</html>`), 'image/png');
}

it('produces a self-contained readonly receipt and executable planned journal classifications', () => {
  const fixture = createFixture();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from('jpeg')]);
  const jpegHash = addAttachment(fixture, 'canonical', jpeg, 'image/jpeg');
  fs.writeFileSync(path.join(fixture.assetsDir, `${jpegHash}.jpeg`), jpeg);
  fs.writeFileSync(path.join(fixture.assetsDir, 'different-hash-neighbor'), 'keep');
  addAttachment(fixture, 'repair', Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), 'image/jpeg');
  addHtml(fixture, 'html-orphan', 'orphan');
  addHtml(fixture, 'html-attached', 'attached');
  addHtml(fixture, 'html-current', 'current');
  addHtml(fixture, 'html-trash', 'trash');
  addHtml(fixture, 'html-version', 'version');
  addHtml(fixture, 'html-external', 'external');
  addHtml(fixture, 'html-pdf', 'pdf');
  addAttachment(fixture, 'unknown', Buffer.from('unknown bytes'), 'image/png');
  addAttachment(fixture, `missing-${'a'.repeat(56)}`, null, 'image/webp');
  addAttachment(fixture, 'unresolved', null, null);
  fixture.db.exec(`
    INSERT INTO nodes VALUES ('roles', '', NULL, NULL);
    INSERT INTO node_attachments VALUES ('roles', 'canonical', 'image');
    INSERT INTO node_attachments VALUES ('roles', 'canonical', 'reference');
    INSERT INTO node_attachments VALUES ('roles', 'canonical', 'cover');
    INSERT INTO nodes VALUES ('attached', '', NULL, NULL);
    INSERT INTO node_attachments VALUES ('attached', 'html-attached', 'image');
    INSERT INTO nodes VALUES ('current', '![x](asset://html-current)', NULL, NULL);
    INSERT INTO nodes VALUES ('trash', '![x](asset://html-trash)', NULL, '2026-09-10T00:00:00.000Z');
    INSERT INTO nodes VALUES ('code', '\`![x](asset://html-orphan)\`', NULL, NULL);
    INSERT INTO node_sync_versions VALUES ('v1', 'version-node', '{"attachmentId":"html-version"}');
    INSERT INTO external_documents VALUES ('external', '![x](asset://html-external)', NULL);
    INSERT INTO pdf_page_text VALUES ('html-pdf', 1, 'derived');
  `);
  fixture.db.close();
  const outputPath = path.join(fixture.root, 'receipt.json');
  const receipt = runCanonicalAttachmentPreflight({ ...fixture, outputPath });
  const byId = new Map(receipt.plan.items.map((item) => [item.attachmentId, item]));
  expect(byId.get('canonical')).toMatchObject({ decision: 'canonicalize', canonicalStorageKey: `${jpegHash}.jpg` });
  expect(byId.get('canonical')?.aliases.map((item) => item.name)).toContain(`${jpegHash}.jpeg`);
  expect(byId.get('canonical')?.references.nodeAttachments.map((item) => item.role).sort())
    .toEqual(['cover', 'image', 'reference']);
  expect(byId.get('repair')).toMatchObject({ decision: 'image_mime_repair', detectedKind: 'image/png' });
  expect(byId.get('html-orphan')?.decision).toBe('html_orphan_delete');
  for (const id of ['html-attached', 'html-current', 'html-trash', 'html-version', 'html-external', 'html-pdf']) {
    expect(byId.get(id)).toMatchObject({ decision: 'residual_blocker',
      residualReasons: expect.arrayContaining(['html_has_authoritative_reference']) });
  }
  expect(byId.get('unknown')?.decision).toBe('residual_blocker');
  expect(byId.get(`missing-${'a'.repeat(56)}`)?.decision).toBe('known_missing');
  expect(byId.get('unresolved')?.decision).toBe('no_bytes_unresolved');
  expect(receipt.productionState.unchanged).toBe(true);
  expect(receipt.openContract).toEqual({ fileMustExist: true, mode: 'readonly', productionInitializationCalled: false });
  expect(JSON.parse(fs.readFileSync(outputPath, 'utf8')).plan.journalPlan).toEqual(receipt.plan.journalPlan);
  expect(receipt.plan.files.some((file) => file.name === 'different-hash-neighbor')).toBe(true);
});
