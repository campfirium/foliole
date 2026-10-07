// @vitest-environment node

import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { loadVerifiedBodyRef, readBodyText } from '../sync/verifiedBody.js';

import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';

function oldDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const name of ['content_blobs', 'content_blob_data']) {
    sqlite.exec(DESKTOP_RESOURCE_SCHEMA_STATEMENTS.find((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${name} (`))!);
  }
  sqlite.exec(`CREATE TABLE node_sync_versions (
    version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, body_text TEXT, snapshot_json TEXT NOT NULL,
    content_hash TEXT NOT NULL, parent_version_id TEXT, host_name TEXT, created_at TEXT)`);
  sqlite.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT NOT NULL, body_blob_hash TEXT, updated_at TEXT NOT NULL)');
  return { sqlite, db: createBetterSqliteDbPort(sqlite) };
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

function insertBody(sqlite: Database.Database, text: string) {
  const digest = hash(text);
  const size = Buffer.byteLength(text);
  sqlite.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, compression, original_size_bytes,
    stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
    VALUES (?, ?, 'text_body', 'none', ?, ?, ?, ?, 'local', '2026-10-07T00:00:00Z')`)
    .run(digest, `text/${digest}`, size, size, digest, digest);
  sqlite.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(digest, Buffer.from(text));
  return digest;
}

function insertVersion(sqlite: Database.Database, id: string, text: string | null, snapshot: object) {
  sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, body_text, snapshot_json, content_hash, parent_version_id, host_name, created_at)
    VALUES (?, 'node', ?, ?, ?, ?, 'host', '2026-10-07T00:00:00Z')`)
    .run(id, text, JSON.stringify(snapshot), `fact-${id}`, id === 'current' ? 'previous' : null);
}

it('maps readable, empty, retired and unavailable versions without two persistent body copies', async () => {
  const { sqlite, db } = oldDatabase();
  try {
    const text = '\ufeff---\r\nkey: 中文😀\r\n---\r\n' + 'x'.repeat(3 * 1024 * 1024);
    const digest = insertBody(sqlite, text);
    insertVersion(sqlite, 'current', text, { id: 'node', body_blob_hash: digest, content: '', title: 'Title' });
    insertVersion(sqlite, 'previous', null, { id: 'node', body_blob_hash: hash('history'), content: 'history' });
    insertVersion(sqlite, 'empty', '', { id: 'node', body_blob_hash: hash(''), content: '' });
    insertVersion(sqlite, 'retired', null, { id: 'node', body_blob_hash: null, content: null });
    insertVersion(sqlite, 'unavailable', null, { id: 'node', body_blob_hash: hash('missing'), content: null });
    insertVersion(sqlite, 'transport-tombstone', '', { id: 'node', body_blob_hash: hash('deleted body'),
      content: '', deleted_at: '2026-10-07T00:00:00Z' });
    await migrateBodyContentStorage(db);
    const ref = await loadVerifiedBodyRef(db, digest);
    expect(ref).not.toBeNull();
    expect(await readBodyText(db, ref!)).toBe(text);
    expect(ref!.frontmatterEnd).toBe(Buffer.byteLength('\ufeff---\r\nkey: 中文😀\r\n---\r\n'));
    expect(sqlite.prepare('SELECT count(*) AS count FROM content_blob_data').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) AS count FROM node_sync_versions WHERE body_text IS NOT NULL').get())
      .toEqual({ count: 0 });
    const versions = sqlite.prepare(`SELECT version_id, body_state, body_blob_hash, content_hash, parent_version_id,
      json_extract(snapshot_json, '$.content') AS content FROM node_sync_versions ORDER BY version_id`).all();
    expect(versions).toEqual([
      { version_id: 'current', body_state: 'readable', body_blob_hash: digest, content_hash: 'fact-current', parent_version_id: 'previous', content: null },
      { version_id: 'empty', body_state: 'readable', body_blob_hash: hash(''), content_hash: 'fact-empty', parent_version_id: null, content: null },
      { version_id: 'previous', body_state: 'readable', body_blob_hash: hash('history'), content_hash: 'fact-previous', parent_version_id: null, content: null },
      { version_id: 'retired', body_state: 'retired', body_blob_hash: null, content_hash: 'fact-retired', parent_version_id: null, content: null },
      { version_id: 'transport-tombstone', body_state: 'unavailable', body_blob_hash: hash('deleted body'), content_hash: 'fact-transport-tombstone', parent_version_id: null, content: null },
      { version_id: 'unavailable', body_state: 'unavailable', body_blob_hash: hash('missing'), content_hash: 'fact-unavailable', parent_version_id: null, content: null }
    ]);
    const history = await loadVerifiedBodyRef(db, hash('history'));
    expect(await readBodyText(db, history!)).toBe('history');
  } finally { sqlite.close(); }
});

it('migrates unversioned current bodies and empties inline copies while preserving unavailable identities', async () => {
  const { sqlite, db } = oldDatabase();
  try {
    const body = '\ufeff---\r\nkey: ' + 'x'.repeat(3 * 1024 * 1024) + '\r\n---\r\nOriginal';
    const existing = insertBody(sqlite, '---\nkey: value\n---\nHashed');
    const missing = hash('unavailable');
    const insert = sqlite.prepare("INSERT INTO nodes VALUES (?, ?, ?, '2026-10-07T00:00:00Z')");
    insert.run('inline', body, null);
    insert.run('empty', '', '   ');
    insert.run('hashed', '---\nkey: value\n---\n', existing);
    insert.run('unavailable', 'old prefix', missing);
    await migrateBodyContentStorage(db);
    expect(sqlite.prepare('SELECT id, content, body_blob_hash FROM nodes ORDER BY id').all()).toEqual([
      { id: 'empty', content: '', body_blob_hash: hash('') },
      { id: 'hashed', content: '', body_blob_hash: existing },
      { id: 'inline', content: '', body_blob_hash: hash(body) },
      { id: 'unavailable', content: '', body_blob_hash: missing }
    ]);
    const ref = await loadVerifiedBodyRef(db, hash(body));
    expect(await readBodyText(db, ref!)).toBe(body);
    expect(ref!.frontmatterEnd).toBe(Buffer.byteLength(body) - Buffer.byteLength('Original'));
    expect(await loadVerifiedBodyRef(db, missing)).toBeNull();
    expect(sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    expect(sqlite.prepare('SELECT original_size_bytes FROM content_blobs WHERE hash = ?').pluck().get(hash(body)))
      .toBe(Buffer.byteLength(body));
  } finally { sqlite.close(); }
});

it('restores every original source when current-owner adoption fails after version migration', async () => {
  const { sqlite, db } = oldDatabase();
  try {
    const digest = insertBody(sqlite, 'Original version');
    insertVersion(sqlite, 'current', 'Original version', { content: 'Original version', body_blob_hash: digest });
    sqlite.prepare("INSERT INTO nodes VALUES ('inline', 'Unversioned body', NULL, '2026-10-07T00:00:00Z')").run();
    const before = sqlite.prepare('SELECT * FROM node_sync_versions').all();
    sqlite.exec(`CREATE TRIGGER fail_current_adoption BEFORE UPDATE ON nodes
      BEGIN SELECT RAISE(ABORT, 'current_owner_unavailable'); END`);
    await expect(migrateBodyContentStorage(db)).rejects.toThrow('current_owner_unavailable');
    expect(sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
    expect(sqlite.prepare("SELECT content, body_blob_hash FROM nodes WHERE id = 'inline'").get())
      .toEqual({ content: 'Unversioned body', body_blob_hash: null });
    expect(sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').get(digest))
      .toEqual({ data: Buffer.from('Original version') });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_bodies'").get()).toBeUndefined();
  } finally { sqlite.close(); }
});

it('rolls back the entire upgrade when a readable version has contradictory original bytes', async () => {
  const { sqlite, db } = oldDatabase();
  try {
    const digest = insertBody(sqlite, 'preserve me');
    insertVersion(sqlite, 'invalid', 'other text', { id: 'node', body_blob_hash: digest, content: '' });
    const before = sqlite.prepare('SELECT * FROM node_sync_versions').all();
    await expect(migrateBodyContentStorage(db)).rejects.toThrow('body_migration_version_hash_mismatch');
    expect(sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(before);
    expect(sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').get(digest))
      .toEqual({ data: Buffer.from('preserve me') });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_bodies'").get()).toBeUndefined();
  } finally { sqlite.close(); }
});
