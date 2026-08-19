import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionSyncSchemaStatements';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { applyCompanionSyncNodeVersionsWithSharedCore } from './companionSyncNodeVersions';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('keeps sequential reading settings when companion applies node versions through shared core', async () => {
  db = new Database(':memory:');
  installSchema(db);

  await expect(applyCompanionSyncNodeVersionsWithSharedCore(createFakeCapacitorConnection(db) as never, [nodeVersion()]))
    .resolves.toEqual(['node-1']);

  expect(db.prepare('SELECT sequential_reading_enabled FROM nodes WHERE id = ?').get('node-1') as unknown)
    .toEqual({ sequential_reading_enabled: 1 });
});

function nodeVersion(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: 'hash-1',
    host_name: 'android-device',
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

function installSchema(database: Database.Database) {
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(`
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
