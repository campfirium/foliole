import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

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

it('unlinks nodes before applying an attachment tombstone', async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  installStateObjectSchema(db);
  installAttachmentSchema(db);

  await expect(applyCompanionSyncObjectsWithSharedCore(createFakeCapacitorConnection(db) as never, [
    attachmentTombstone()
  ])).resolves.toEqual(['attachment:att-1']);

  expect(db.prepare('SELECT COUNT(*) AS count FROM node_attachments').get() as unknown).toEqual({ count: 0 });
  expect(db.prepare('SELECT COUNT(*) AS count FROM attachments').get() as unknown).toEqual({ count: 0 });
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

  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 20, false);
  expect(connection.open).toHaveBeenCalled();
});

function settingObject(): NativeSyncObjectRecord {
  return {
    content_hash: 'setting-hash-1',
    deleted_at: null,
    object_id: 'user_space:android:mobile:*:app_settings',
    object_type: 'setting',
    payload_json: JSON.stringify({
      device_id: '*',
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
    object_id: 'att-1',
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
      device_id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (key, scope, platform, form_factor, device_id)
    );
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER NOT NULL,
      current_version_id TEXT,
      content_hash TEXT NOT NULL,
      last_modified_by_device_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      PRIMARY KEY (object_type, object_id)
    );
  `);
}

function installAttachmentSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY,
      original_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE attachment_blobs (
      attachment_id TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE
    );
    CREATE TABLE pdf_page_text (
      attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (attachment_id, page)
    );
    CREATE TABLE node_attachments (
      node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      attachment_id TEXT NOT NULL REFERENCES attachments(id),
      role TEXT NOT NULL,
      PRIMARY KEY (node_id, attachment_id, role)
    );
    INSERT INTO nodes (id) VALUES ('node-1');
    INSERT INTO attachments (id, created_at) VALUES ('att-1', '2026-05-04T01:00:00.000Z');
    INSERT INTO attachment_blobs (attachment_id) VALUES ('att-1');
    INSERT INTO pdf_page_text (attachment_id, page, text) VALUES ('att-1', 1, 'PDF text');
    INSERT INTO node_attachments (node_id, attachment_id, role) VALUES ('node-1', 'att-1', 'reference');
  `);
}
