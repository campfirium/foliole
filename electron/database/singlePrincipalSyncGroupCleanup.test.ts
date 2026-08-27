// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

it('starts normally while discarding retired desktop Sync Group state', () => {
  const sqlite = retiredDesktopSyncGroupFixture();

  initializeDatabaseSchema(sqlite);
  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_group_members'").get()).toBeUndefined();
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_groups').pluck().get()).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_group_devices').pluck().get()).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_delivery_receipts').pluck().get()).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_peers').pluck().get()).toBe(0);
  expect(sqlite.prepare("SELECT value FROM workspace_meta WHERE key = 'cleanup_fixture'").pluck().get())
    .toBe('business-data');
  sqlite.close();
});

it('rolls back desktop cleanup and schema version on a failed startup', () => {
  const sqlite = retiredDesktopSyncGroupFixture();

  expect(() => initializeDatabaseSchema(sqlite, {
    beforeVersionCommit: () => { throw new Error('injected cleanup failure'); }
  })).toThrow('injected cleanup failure');

  expect(sqlite.pragma('user_version', { simple: true })).toBe(77);
  expect(sqlite.prepare('SELECT group_id FROM sync_groups').pluck().get()).toBe('group');
  expect(sqlite.prepare('SELECT host_name FROM sync_group_members').pluck().get()).toBe('Old Mac');
  expect(sqlite.prepare('SELECT peer_id FROM sync_peers').pluck().get()).toBe('old-route');
  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_group_devices'").get()).toBeUndefined();
  expect(sqlite.prepare("SELECT value FROM workspace_meta WHERE key = 'cleanup_fixture'").pluck().get())
    .toBe('business-data');
  sqlite.close();
});

function retiredDesktopSyncGroupFixture() {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`
    DROP TRIGGER trg_sync_delivery_state_insert;
    DROP TRIGGER trg_sync_delivery_state_update;
    DROP TRIGGER trg_sync_delivery_device_leave;
    DROP TRIGGER trg_sync_delivery_review_insert;
    DROP TABLE sync_group_local_state;
    DROP TABLE sync_group_nonce_ledger;
    DROP TABLE sync_group_devices;
    DROP TABLE sync_groups;
    DROP TABLE sync_delivery_receipts;
    DROP TABLE sync_peer_cursors;
    CREATE TABLE sync_groups (group_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
      timeline_id TEXT NOT NULL, created_by_host_name TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, workgroup_key TEXT);
    CREATE TABLE sync_group_members (group_id TEXT NOT NULL, host_name TEXT NOT NULL,
      host_platform TEXT NOT NULL, state TEXT NOT NULL, approved_by_host_name TEXT NOT NULL,
      authorization_id TEXT NOT NULL UNIQUE, provisioning_cursor INTEGER, joined_at TEXT NOT NULL,
      activated_at TEXT, left_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (group_id, host_name));
    CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, group_id TEXT,
      local_host_name TEXT NOT NULL, member_state TEXT NOT NULL, provisioning_cursor INTEGER,
      created_empty_proof_json TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE sync_delivery_receipts (authorization_id TEXT NOT NULL, stream_name TEXT NOT NULL,
      operation_id TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
      payload_identity TEXT NOT NULL, local_position TEXT, status TEXT NOT NULL,
      remote_position TEXT, issue_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (authorization_id, stream_name, operation_id));
    CREATE TABLE sync_peer_cursors (authorization_id TEXT NOT NULL, stream_name TEXT NOT NULL,
      cursor_value TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (authorization_id, stream_name));
    INSERT INTO sync_groups VALUES ('group','Old Group','timeline','Old Mac','old','old','key');
    INSERT INTO sync_group_members VALUES
      ('group','Old Mac','darwin','active','Old Mac','auth',NULL,'old','old',NULL,'old');
    INSERT INTO sync_group_local_state VALUES (1,'group','Old Mac','active',NULL,NULL,'old');
    INSERT INTO sync_delivery_receipts VALUES
      ('auth','state','legacy-op','setting','setting-a','hash','1','pending',NULL,NULL,'old','old');
    INSERT INTO sync_peers VALUES ('old-route','paired',NULL,'legacy-cursor','old');
    INSERT INTO workspace_meta VALUES ('cleanup_fixture','business-data','old');
    PRAGMA user_version = 77;
  `);
  return sqlite;
}
