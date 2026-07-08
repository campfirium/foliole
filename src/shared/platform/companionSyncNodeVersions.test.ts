import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionSyncSchemaStatements';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import {
  applyCompanionSyncNodeVersionsWithSharedCore,
  applyCompanionSyncNodeVersionsWithSharedCoreOnDevice
} from './companionSyncNodeVersions';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('applies node versions through the Capacitor DbPort adapter and shared core', async () => {
  db = new Database(':memory:');
  installNodeApplySchema(db);
  const applied = await applyCompanionSyncNodeVersionsWithSharedCore(createFakeCapacitorConnection(db) as never, [
    nodeVersion()
  ]);

  expect(applied).toEqual(['node-1']);
  expect(db.prepare('SELECT title, current_version_id FROM nodes WHERE id = ?').get('node-1') as unknown).toEqual({
    current_version_id: 'android#1',
    title: 'Android Node'
  });
  expect(db.prepare('SELECT version_id, object_id FROM node_sync_versions').all() as unknown).toEqual([{
    object_id: 'node-1',
    version_id: 'android#1'
  }]);
});

it('opens the Android companion database before running the shared core', async () => {
  db = new Database(':memory:');
  installNodeApplySchema(db);
  const connection = createMockCapacitorConnection(db);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  await expect(applyCompanionSyncNodeVersionsWithSharedCoreOnDevice([nodeVersion()], manager as never))
    .resolves.toEqual(['node-1']);

  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 18, false);
  expect(connection.open).toHaveBeenCalled();
});

it('retrieves the Android companion database when create reports an existing connection', async () => {
  db = new Database(':memory:');
  installNodeApplySchema(db);
  const connection = createMockCapacitorConnection(db);
  const manager = {
    createConnection: vi.fn(async () => {
      throw new Error('CreateConnection: Connection foliole-companion already exists');
    }),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn(async () => connection)
  };

  await expect(applyCompanionSyncNodeVersionsWithSharedCoreOnDevice([nodeVersion()], manager as never))
    .resolves.toEqual(['node-1']);

  expect(manager.retrieveConnection).toHaveBeenCalledWith('foliole-companion', false);
  expect(connection.open).toHaveBeenCalled();
});

it('recreates the Android companion database connection when the cached handle is stale', async () => {
  db = new Database(':memory:');
  installNodeApplySchema(db);
  const connection = createMockCapacitorConnection(db);
  const manager = {
    checkConnectionsConsistency: vi.fn(async () => ({ result: true })),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: true })),
    retrieveConnection: vi.fn(async () => {
      throw new Error('Connection foliole-companion does not exist');
    })
  };

  await expect(applyCompanionSyncNodeVersionsWithSharedCoreOnDevice([nodeVersion()], manager as never))
    .resolves.toEqual(['node-1']);

  expect(manager.checkConnectionsConsistency).toHaveBeenCalled();
  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 18, false);
  expect(connection.open).toHaveBeenCalled();
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

function createMockCapacitorConnection(database: Database.Database) {
  const connection = createFakeCapacitorConnection(database);
  return {
    ...connection,
    close: vi.fn(connection.close),
    open: vi.fn(connection.open)
  };
}

function installNodeApplySchema(database: Database.Database) {
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(`
    CREATE TABLE search_index_invalidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invalidation_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_error TEXT,
      claimed_at TEXT,
      completed_at TEXT
    );
  `);
  installContentBlobSchema(database);
}

function installContentBlobSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE content_blobs (
      hash TEXT PRIMARY KEY,
      storage_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      compression TEXT NOT NULL,
      original_size_bytes INTEGER NOT NULL,
      stored_size_bytes INTEGER NOT NULL,
      original_sha256 TEXT NOT NULL,
      stored_sha256 TEXT NOT NULL,
      availability TEXT NOT NULL,
      created_at TEXT NOT NULL,
      cached_at TEXT,
      last_verified_at TEXT
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
  `);
}
