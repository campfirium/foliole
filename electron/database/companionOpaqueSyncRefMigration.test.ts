// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migrateCompanionOpaqueSyncRefs } from '../../lib/core/database/companionOpaqueSyncRefsMigration.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

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
    INSERT INTO node_sync_versions VALUES
      ('Phone#1','n',NULL,'{"version_id":"Phone#1"}'),
      ('Phone#2','n','Phone#1','{"parent_version_id":"Phone#1"}');
    INSERT INTO node_sync_version_parents VALUES ('Phone#2','Phone#1',0);
    INSERT INTO nodes VALUES ('n','Phone#2','Phone#1');
    INSERT INTO sync_object_state VALUES ('node','n','Phone#2');
    INSERT INTO sync_change_log VALUES
      ('Phone#event','Phone#1','Phone#2','{"base":"Phone#1","event":"Phone#event"}');
    INSERT INTO node_sync_tombstones VALUES ('n','Phone#2','Phone#1','{"version_id":"Phone#2"}');
    INSERT INTO node_sync_conflicts VALUES ('Phone#2','Phone#1','{"version_id":"Phone#2"}');
    INSERT INTO node_text_alternatives VALUES ('Phone#1');
    INSERT INTO sync_peers VALUES ('Phone#2');
    INSERT INTO review_log VALUES ('Phone#review');
    INSERT INTO sync_delivery_receipts VALUES ('node:Phone#2','Phone#2');
  `);
  return createBetterSqliteDbPort(sqlite);
}

describe.each(['android', 'ios'] as const)('%s opaque sync ref migration', () => {
  it('roundtrips the complete reference graph without retaining the Host encoding', async () => {
    const port = fixture();
    await port.transaction((tx) => migrateCompanionOpaqueSyncRefs(tx));
    const versions = sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_versions').all() as
      Array<{ parent_version_id: string | null; version_id: string }>;
    expect(versions.every((row) => row.version_id.startsWith('ver_'))).toBe(true);
    const child = versions.find((row) => row.parent_version_id)!;
    expect(sqlite.prepare('SELECT current_version_id FROM nodes').pluck().get()).toBe(child.version_id);
    expect(sqlite.prepare('SELECT operation_id FROM sync_delivery_receipts').pluck().get())
      .toBe(`node:${child.version_id}`);
    expect(sqlite.prepare('SELECT change_id FROM sync_change_log').pluck().get()).toMatch(/^evt_/);
    expect(sqlite.prepare('SELECT op_id FROM review_log').pluck().get()).toMatch(/^evt_/);
  });

  it('rolls back graph and embedded references after an injected failure', async () => {
    const port = fixture();
    await expect(port.transaction(async (tx) => {
      await migrateCompanionOpaqueSyncRefs(tx);
      throw new Error('injected companion opaque ref failure');
    })).rejects.toThrow('injected companion opaque ref failure');
    expect(sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').pluck().all())
      .toEqual(['Phone#1', 'Phone#2']);
    expect(sqlite.prepare('SELECT operation_id FROM sync_delivery_receipts').pluck().get()).toBe('node:Phone#2');
  });
});
