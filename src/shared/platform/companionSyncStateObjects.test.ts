import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from '../../../lib/core/database/syncStateSequenceSchemaStatements';
import { COMPANION_DATABASE_VERSION } from '../../../lib/platform/nativeCompanionContract';
import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import {
  applyCompanionSyncObjectsWithSharedCore,
  applyCompanionSyncObjectsWithSharedCoreOnDevice
} from './companionSyncStateObjects';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('applies state objects through the Capacitor DbPort adapter and shared core', async () => {
  db = new Database(':memory:');
  installStateObjectSchema(db);

  await expect(applyCompanionSyncObjectsWithSharedCore(createFakeCapacitorConnection(db) as never, [
    settingObject()
  ])).resolves.toEqual(['setting:user_space:android:mobile:*:app_settings']);

  expect(db.prepare('SELECT key, value_json FROM setting_records').get() as unknown).toEqual({
    key: 'app_settings',
    value_json: '{"theme":"dark"}'
  });
  expect(db.prepare('SELECT content_hash, sync_dirty FROM sync_object_state').get() as unknown).toEqual({
    content_hash: 'setting-hash-1',
    sync_dirty: 0
  });
});

it('ignores retired attachment tombstones without changing current node resources, body or state', async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  installStateObjectSchema(db);
  installNodeResourceSchema(db);
  const before = db.prepare('SELECT * FROM nodes').all();
  const stateBefore = db.prepare('SELECT * FROM sync_object_state').all();

  await expect(applyCompanionSyncObjectsWithSharedCore(createFakeCapacitorConnection(db) as never, [
    attachmentTombstone()
  ])).resolves.toEqual([]);

  expect(db.prepare('SELECT * FROM nodes').all()).toEqual(before);
  expect(db.prepare('SELECT * FROM sync_object_state').all()).toEqual(stateBefore);
});

it('opens the Android companion database before applying state objects', async () => {
  db = new Database(':memory:');
  installStateObjectSchema(db);
  const connection = createFakeCapacitorConnection(db);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  await expect(applyCompanionSyncObjectsWithSharedCoreOnDevice([settingObject()], manager as never))
    .resolves.toEqual(['setting:user_space:android:mobile:*:app_settings']);

  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', COMPANION_DATABASE_VERSION, false);
  expect(connection.open).toHaveBeenCalled();
});

function settingObject(): NativeSyncObjectRecord {
  return {
    content_hash: 'setting-hash-1',
    deleted_at: null,
    object_id: 'user_space:android:mobile:*:app_settings',
    object_type: 'setting',
    payload_json: JSON.stringify({
      host_name: '*',
      form_factor: 'mobile',
      key: 'app_settings',
      platform: 'android',
      scope: 'user_space',
      value_json: '{"theme":"dark"}'
    }),
    updated_at: '2026-05-04T01:00:00.000Z'
  };
}

function attachmentTombstone(): NativeSyncObjectRecord {
  return {
    content_hash: 'attachment-delete-hash-1',
    deleted_at: '2026-05-04T02:00:00.000Z',
    object_id: 'a'.repeat(64),
    object_type: 'attachment',
    payload_json: null,
    updated_at: '2026-05-04T02:00:00.000Z'
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
    close: vi.fn(async () => undefined),
    execute: async (sql: string) => {
      database.exec(sql);
      const row = database.prepare('SELECT changes() AS count').get() as { count: number };
      return { changes: { changes: row.count } };
    },
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: async (sql: string, params: unknown[] = []) => ({
      values: database.prepare(sql).all(...params)
    }),
    rollbackTransaction: async () => {
      database.exec('ROLLBACK');
    },
    run: async (sql: string, params: unknown[] = []) => {
      const info = database.prepare(sql).run(...params);
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

function installStateObjectSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE setting_records (
      key TEXT NOT NULL,
      scope TEXT NOT NULL,
      platform TEXT NOT NULL,
      form_factor TEXT NOT NULL,
      host_name TEXT NOT NULL,
      value_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (key, scope, platform, form_factor, host_name)
    );
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER NOT NULL,
      current_version_id TEXT,
      content_hash TEXT NOT NULL,
      last_modified_by_host_name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      PRIMARY KEY (object_type, object_id)
    );
  `);
  database.exec(SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS.join(';\n'));
}

function installNodeResourceSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      resource_references TEXT NOT NULL,
      current_version_id TEXT NOT NULL,
      sync_dirty INTEGER NOT NULL
    );
  `);
  database.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?)').run(
    'node-1', '# Current body', JSON.stringify([{
      storage_key: `${'a'.repeat(64)}.pdf`, role: 'reference', original_name: 'Original.pdf'
    }]), 'node-version-1', 1
  );
  database.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
     last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'node', 'node-1', 1, 'node-version-1', 'node-hash-1', 'mobile', '2026-05-04T01:00:00.000Z', 1, null
  );
}
