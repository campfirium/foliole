// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migrateOpaqueSyncRefs } from '../../lib/core/database/numberedMigrationOpaqueSyncRefs.js';

let sqlite: Database.Database;

afterEach(() => sqlite?.close());

function fixture() {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT, anchor_source_version_id TEXT);
    CREATE TABLE node_sync_versions (
      version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, parent_version_id TEXT,
      snapshot_json TEXT, FOREIGN KEY(parent_version_id) REFERENCES node_sync_versions(version_id)
    );
    CREATE TABLE node_sync_version_parents (
      version_id TEXT NOT NULL REFERENCES node_sync_versions(version_id),
      parent_version_id TEXT NOT NULL REFERENCES node_sync_versions(version_id), ordinal INTEGER NOT NULL,
      PRIMARY KEY(version_id, parent_version_id)
    );
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, current_version_id TEXT);
    CREATE TABLE sync_change_log (
      change_id TEXT PRIMARY KEY, base_version_id TEXT, result_version_id TEXT, payload_json TEXT
    );
    CREATE TABLE node_sync_tombstones (
      node_id TEXT PRIMARY KEY, version_id TEXT, parent_version_id TEXT, snapshot_json TEXT
    );
    CREATE TABLE node_sync_conflicts (
      conflict_version_id TEXT PRIMARY KEY, parent_version_id TEXT, snapshot_json TEXT
    );
    CREATE TABLE node_text_alternatives (source_version_id TEXT);
    CREATE TABLE sync_peers (last_seen_version_cursor TEXT);
    CREATE TABLE review_log (op_id TEXT PRIMARY KEY);
    CREATE TABLE sync_delivery_receipts (operation_id TEXT PRIMARY KEY, payload_identity TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO node_sync_versions VALUES
      ('Old Host#1','n',NULL,'{"version_id":"Old Host#1","title":"Old Host#1 in prose"}'),
      ('Old Host#2','n','Old Host#1','{"parents":["Old Host#1"]}');
    INSERT INTO node_sync_version_parents VALUES ('Old Host#2','Old Host#1',0);
    INSERT INTO nodes VALUES ('n','Old Host#2','Old Host#1');
    INSERT INTO sync_object_state VALUES ('node','n','Old Host#2');
    INSERT INTO sync_change_log VALUES
      ('Old Host#event','Old Host#1','Old Host#2','{"base":"Old Host#1","event":"Old Host#event"}');
    INSERT INTO node_sync_tombstones VALUES
      ('n','Old Host#2','Old Host#1','{"version_id":"Old Host#2"}');
    INSERT INTO node_sync_conflicts VALUES
      ('Old Host#2','Old Host#1','{"version_id":"Old Host#2"}');
    INSERT INTO node_text_alternatives VALUES ('Old Host#1');
    INSERT INTO sync_peers VALUES ('Old Host#2');
    INSERT INTO review_log VALUES ('Old Host#review');
    INSERT INTO sync_delivery_receipts VALUES ('node:Old Host#2','Old Host#2');
    INSERT INTO settings VALUES ('desktop_node_sync_version_counter','2');
    INSERT INTO settings VALUES ('desktop_node_sync_restore_incarnation','legacy');
  `);
  return sqlite;
}

describe('desktop opaque sync ref migration', () => {
  it('atomically rewrites graph, conflict, tombstone, receipt, event, and embedded references', () => {
    const db = fixture();
    db.transaction(() => migrateOpaqueSyncRefs(db))();

    const versions = db.prepare('SELECT version_id, parent_version_id, snapshot_json FROM node_sync_versions ORDER BY parent_version_id').all() as
      Array<{ parent_version_id: string | null; snapshot_json: string; version_id: string }>;
    expect(versions.every((row) => row.version_id.startsWith('ver_'))).toBe(true);
    const child = versions.find((row) => row.parent_version_id !== null)!;
    expect(child.parent_version_id).toMatch(/^ver_/);
    expect(JSON.parse(child.snapshot_json).parents).toEqual([child.parent_version_id]);
    expect(db.prepare('SELECT version_id, parent_version_id FROM node_sync_tombstones').get())
      .toEqual({ parent_version_id: child.parent_version_id, version_id: child.version_id });
    expect(db.prepare('SELECT conflict_version_id, parent_version_id FROM node_sync_conflicts').get())
      .toEqual({ conflict_version_id: child.version_id, parent_version_id: child.parent_version_id });
    expect(db.prepare('SELECT operation_id, payload_identity FROM sync_delivery_receipts').get())
      .toEqual({ operation_id: `node:${child.version_id}`, payload_identity: child.version_id });
    expect(db.prepare('SELECT change_id FROM sync_change_log').pluck().get()).toMatch(/^evt_/);
    expect(db.prepare('SELECT op_id FROM review_log').pluck().get()).toMatch(/^evt_/);
    expect(db.prepare("SELECT COUNT(*) FROM settings WHERE key LIKE 'desktop_node_sync_%'").pluck().get()).toBe(0);
    expect(JSON.parse(versions.find((row) => row.parent_version_id === null)!.snapshot_json).title)
      .toBe('Old Host#1 in prose');
  });

  it('restores every reference when the version commit fails', () => {
    const db = fixture();
    expect(() => db.transaction(() => {
      migrateOpaqueSyncRefs(db);
      throw new Error('injected opaque ref failure');
    })()).toThrow('injected opaque ref failure');
    expect(db.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').pluck().all())
      .toEqual(['Old Host#1', 'Old Host#2']);
    expect(db.prepare('SELECT operation_id FROM sync_delivery_receipts').pluck().get()).toBe('node:Old Host#2');
  });
});
