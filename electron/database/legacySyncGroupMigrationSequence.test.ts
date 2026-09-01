// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

it('upgrades the public schema 62 boundary through the legacy delivery migration', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER NOT NULL,
      current_version_id TEXT,
      content_hash TEXT NOT NULL,
      last_modified_by_host_name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_dirty INTEGER NOT NULL,
      base_content_hash TEXT,
      PRIMARY KEY (object_type, object_id)
    );
    CREATE TABLE review_log (
      op_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );
    PRAGMA user_version = 62;
  `);

  migrateNumberedFixtureTo(sqlite, 64);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(64);
  expect(sqlite.prepare("SELECT name FROM pragma_table_info('sync_group_members') ORDER BY cid").pluck().all())
    .toContain('device_id');
  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").pluck().all())
    .toEqual([
      'trg_sync_delivery_member_leave',
      'trg_sync_delivery_review_insert',
      'trg_sync_delivery_state_insert',
      'trg_sync_delivery_state_update'
    ]);
  sqlite.close();
});
