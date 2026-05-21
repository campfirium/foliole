import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { applyCompanionSyncNodeVersionsWithSharedCore } from './companionSyncNodeVersions';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('keeps sequential reading settings when companion applies node versions through shared core', async () => {
  db = new Database(':memory:');
  installSchema(db);

  await expect(applyCompanionSyncNodeVersionsWithSharedCore(fakeConnection(db) as never, [nodeVersion()]))
    .resolves.toEqual(['node-1']);

  expect(db.prepare('SELECT sequential_reading_enabled FROM nodes WHERE id = ?').get('node-1') as unknown)
    .toEqual({ sequential_reading_enabled: 1 });
});

function nodeVersion(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'hash-1',
    device_id: 'android-device',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Body',
      created_at: '2026-05-04T01:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      sequential_reading_enabled: true,
      hide_title_heading: false,
      id: 'node-1',
      image_regions: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: 'Android Node',
      updated_at: '2026-05-04T01:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-04T01:00:00.000Z',
    version_created_at: '2026-05-04T01:00:00.000Z',
    version_id: 'android#1'
  };
}

function fakeConnection(database: Database.Database) {
  return {
    beginTransaction: async () => database.exec('BEGIN'),
    commitTransaction: async () => database.exec('COMMIT'),
    execute: async (sql: string) => {
      database.exec(sql);
      return { changes: { changes: (database.prepare('SELECT changes() AS count').get() as { count: number }).count } };
    },
    query: async (sql: string, params: unknown[] = []) => ({
      values: database.prepare(sql).all(...params)
    }),
    rollbackTransaction: async () => database.exec('ROLLBACK'),
    run: async (sql: string, params: unknown[] = []) => {
      const info = database.prepare(sql).run(...params);
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

function installSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, priority INTEGER,
      desired_retention REAL, enable_short_term INTEGER, sequential_reading_enabled INTEGER,
      title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, virtual_filter TEXT,
      reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, current_version_id TEXT,
      last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE node_sync_versions (
      version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, parent_version_id TEXT,
      device_id TEXT NOT NULL, created_at TEXT NOT NULL, content_hash TEXT, snapshot_json TEXT NOT NULL
    );
    CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);
    CREATE TABLE attachments (id TEXT PRIMARY KEY);
    CREATE TABLE node_attachments (
      node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY (node_id, attachment_id, role)
    );
    CREATE TABLE content_blobs (
      hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT NOT NULL,
      compression TEXT NOT NULL, original_size_bytes INTEGER NOT NULL, stored_size_bytes INTEGER NOT NULL,
      original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, availability TEXT NOT NULL,
      created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    CREATE TABLE search_index_invalidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invalidation_type TEXT NOT NULL, target_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL, created_at TEXT NOT NULL, last_error TEXT, claimed_at TEXT, completed_at TEXT
    );
  `);
}
