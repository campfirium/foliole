import type Database from 'better-sqlite3';

export function installLegacySyncGroupSchema(sqlite: Database.Database) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_sync_delivery_state_insert;
    DROP TRIGGER IF EXISTS trg_sync_delivery_state_update;
    DROP TRIGGER IF EXISTS trg_sync_delivery_member_leave;
    DROP TRIGGER IF EXISTS trg_sync_delivery_device_leave;
    DROP TRIGGER IF EXISTS trg_sync_delivery_review_insert;
    DROP TABLE IF EXISTS sync_group_local_state;
    DROP TABLE IF EXISTS sync_group_nonce_ledger;
    DROP TABLE IF EXISTS sync_group_member_departures;
    DROP TABLE IF EXISTS sync_group_members;
    DROP TABLE IF EXISTS sync_group_devices;
    DROP TABLE IF EXISTS sync_groups;
    CREATE TABLE sync_groups (group_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
      timeline_id TEXT NOT NULL, created_by_device_id TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, workgroup_key TEXT);
    CREATE TABLE sync_group_members (group_id TEXT NOT NULL, device_id TEXT NOT NULL,
      device_kind TEXT NOT NULL, device_name TEXT NOT NULL, state TEXT NOT NULL,
      approved_by_device_id TEXT NOT NULL, authorization_id TEXT NOT NULL UNIQUE,
      provisioning_cursor INTEGER, joined_at TEXT NOT NULL, activated_at TEXT,
      left_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (group_id, device_id));
    CREATE TABLE sync_group_member_departures (group_id TEXT NOT NULL, device_id TEXT NOT NULL,
      authorized_by_device_id TEXT NOT NULL, authorization_id TEXT NOT NULL UNIQUE,
      left_at TEXT NOT NULL, PRIMARY KEY (group_id, device_id));
    CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, group_id TEXT,
      local_device_id TEXT NOT NULL, member_state TEXT NOT NULL, provisioning_cursor INTEGER,
      created_empty_proof_json TEXT, updated_at TEXT NOT NULL);
  `);
}
