import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import {
  applyCompanionSyncNodeVersionsWithSharedCore,
  applyCompanionSyncNodeVersionsWithSharedCoreOnDevice
} from './companionSyncNodeVersions';

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
  const connection = createFakeCapacitorConnection(db);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  await expect(applyCompanionSyncNodeVersionsWithSharedCoreOnDevice([nodeVersion()], manager as never))
    .resolves.toEqual(['node-1']);

  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 14, false);
  expect(connection.open).toHaveBeenCalled();
});

it('retrieves the Android companion database when create reports an existing connection', async () => {
  db = new Database(':memory:');
  installNodeApplySchema(db);
  const connection = createFakeCapacitorConnection(db);
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
  const connection = createFakeCapacitorConnection(db);
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
  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 14, false);
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

function createFakeCapacitorConnection(database: Database.Database) {
  return {
    beginTransaction: async () => {
      database.exec('BEGIN');
    },
    commitTransaction: async () => {
      database.exec('COMMIT');
    },
    execute: async (sql: string) => {
      database.exec(sql);
      const row = database.prepare('SELECT changes() AS count').get() as { count: number };
      return { changes: { changes: row.count } };
    },
    open: vi.fn(async () => undefined),
    query: async (sql: string, params: unknown[] = []) => ({
      values: database.prepare(sql).all(...decodeParams(params))
    }),
    rollbackTransaction: async () => {
      database.exec('ROLLBACK');
    },
    run: async (sql: string, params: unknown[] = []) => {
      const info = database.prepare(sql).run(...decodeParams(params));
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

function decodeParams(params: unknown[]) {
  return params.map((param) => {
    if (isBufferJson(param)) return Uint8Array.from(param.data);
    return param;
  });
}

function isBufferJson(value: unknown): value is { data: number[]; type: 'Buffer' } {
  return value !== null && typeof value === 'object' && 'type' in value && 'data' in value;
}

function installNodeApplySchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      kind TEXT NOT NULL,
      priority INTEGER,
      desired_retention REAL,
      title TEXT NOT NULL,
      is_title_manual INTEGER NOT NULL DEFAULT 0,
      hide_title_heading INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      body_blob_hash TEXT,
      opening_text TEXT,
      virtual_filter TEXT,
      reveal TEXT,
      anchor_link TEXT,
      image_regions TEXT,
      position INTEGER,
      current_version_id TEXT,
      last_modified_by_device_id TEXT,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE node_sync_versions (
      version_id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL,
      parent_version_id TEXT,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      content_hash TEXT,
      snapshot_json TEXT NOT NULL
    );
    CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);
    CREATE TABLE attachments (id TEXT PRIMARY KEY);
    CREATE TABLE node_attachments (
      node_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (node_id, attachment_id, role)
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
