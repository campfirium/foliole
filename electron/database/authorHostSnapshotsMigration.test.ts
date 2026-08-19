// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionAuthorHostSnapshots } from '../../lib/core/database/companionAuthorHostSnapshotsMigration.js';
import { migrateAuthorHostSnapshots } from '../../lib/core/database/numberedMigrationAuthorHostSnapshots.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let sqlite: Database.Database;

afterEach(() => sqlite?.close());

function fixture() {
  sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, last_modified_by_device_id TEXT, content TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, device_id TEXT, content_hash TEXT);
    CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY, device_id TEXT, content_hash TEXT);
    CREATE TABLE node_sync_conflicts (conflict_version_id TEXT PRIMARY KEY, device_id TEXT, content_hash TEXT);
    CREATE TABLE node_text_alternatives (
      alternative_id TEXT PRIMARY KEY, node_id TEXT, source_device_id TEXT, status TEXT
    );
    CREATE TABLE review_log (op_id TEXT PRIMARY KEY, device_id TEXT, grade INTEGER);
    CREATE TABLE sync_object_state (
      object_type TEXT, object_id TEXT, last_modified_by_device_id TEXT, content_hash TEXT
    );
    CREATE TABLE sync_change_log (change_id TEXT PRIMARY KEY, device_id TEXT, content_hash TEXT, created_at TEXT);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, source_device_id TEXT, content_hash TEXT);
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, source_device_id TEXT, stored_sha256 TEXT);
    CREATE INDEX idx_review_log_device_id ON review_log (device_id);
    CREATE INDEX idx_sync_change_log_device_created ON sync_change_log (device_id, created_at);
    CREATE UNIQUE INDEX idx_node_text_alternatives_available_source
      ON node_text_alternatives (node_id, source_device_id) WHERE status = 'available';
    INSERT INTO nodes VALUES ('n', 'Old Host', 'body');
    INSERT INTO node_sync_versions VALUES ('ver_1', 'Old Host', 'version-hash');
    INSERT INTO node_sync_tombstones VALUES ('n', 'Old Host', 'tombstone-hash');
    INSERT INTO node_sync_conflicts VALUES ('ver_2', 'Peer Host', 'conflict-hash');
    INSERT INTO node_text_alternatives VALUES ('alt', 'n', 'Peer Host', 'available');
    INSERT INTO review_log VALUES ('evt_1', 'Old Host', 3);
    INSERT INTO sync_object_state VALUES ('node', 'n', 'Old Host', 'state-hash');
    INSERT INTO sync_change_log VALUES ('evt_2', 'Old Host', 'change-hash', '2026-08-19T00:00:00Z');
    INSERT INTO attachment_blobs VALUES ('att', 'Old Host', 'attachment-hash');
    INSERT INTO content_blobs VALUES ('blob', 'Peer Host', 'stored-hash');
  `);
  return sqlite;
}

function snapshot(db: Database.Database) {
  return {
    attachment: db.prepare('SELECT source_host_name, content_hash FROM attachment_blobs').get(),
    change: db.prepare('SELECT host_name, content_hash FROM sync_change_log').get(),
    conflict: db.prepare('SELECT host_name, content_hash FROM node_sync_conflicts').get(),
    content: db.prepare('SELECT source_host_name, stored_sha256 FROM content_blobs').get(),
    node: db.prepare('SELECT last_modified_by_host_name, content FROM nodes').get(),
    review: db.prepare('SELECT host_name, grade FROM review_log').get(),
    state: db.prepare('SELECT last_modified_by_host_name, content_hash FROM sync_object_state').get(),
    tombstone: db.prepare('SELECT host_name, content_hash FROM node_sync_tombstones').get(),
    version: db.prepare('SELECT host_name, content_hash FROM node_sync_versions').get()
  };
}

const expected = {
  attachment: { content_hash: 'attachment-hash', source_host_name: 'Old Host' },
  change: { content_hash: 'change-hash', host_name: 'Old Host' },
  conflict: { content_hash: 'conflict-hash', host_name: 'Peer Host' },
  content: { source_host_name: 'Peer Host', stored_sha256: 'stored-hash' },
  node: { content: 'body', last_modified_by_host_name: 'Old Host' },
  review: { grade: 3, host_name: 'Old Host' },
  state: { content_hash: 'state-hash', last_modified_by_host_name: 'Old Host' },
  tombstone: { content_hash: 'tombstone-hash', host_name: 'Old Host' },
  version: { content_hash: 'version-hash', host_name: 'Old Host' }
};

it('renames desktop author columns without changing attribution, content, counts, or hashes', () => {
  const db = fixture();
  db.transaction(() => migrateAuthorHostSnapshots(db))();
  expect(snapshot(db)).toEqual(expected);
  expect(db.prepare('SELECT source_host_name FROM node_text_alternatives').pluck().get()).toBe('Peer Host');
});

it('renames companion author columns with the same lossless result', async () => {
  const db = fixture();
  await migrateCompanionAuthorHostSnapshots(createBetterSqliteDbPort(db));
  expect(snapshot(db)).toEqual(expected);
});

it('rolls every author column back when version commit fails', () => {
  const db = fixture();
  expect(() => db.transaction(() => {
    migrateAuthorHostSnapshots(db);
    throw new Error('injected author snapshot failure');
  })()).toThrow('injected author snapshot failure');
  expect(db.prepare("SELECT name FROM pragma_table_info('node_sync_versions')").pluck().all())
    .toContain('device_id');
  expect(db.prepare('SELECT device_id, content_hash FROM node_sync_versions').get())
    .toEqual({ content_hash: 'version-hash', device_id: 'Old Host' });
});
