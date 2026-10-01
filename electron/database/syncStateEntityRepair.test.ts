// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  db.exec(`DROP TRIGGER trg_sync_state_receipt_insert;
    DROP TRIGGER trg_sync_state_receipt_replace;
    DROP TRIGGER trg_sync_state_receipt_delete;
    PRAGMA user_version = 120;
    INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('live', 'Live', 'now', 'now');
    INSERT INTO node_sync_tombstones
      (node_id, version_id, host_name, content_hash, snapshot_json, deleted_at, created_at)
      VALUES ('known-deletion', 'version-tomb', 'source', 'tomb-hash', '{}', 'now', 'now');`);
  let seq = 0;
  for (const type of ['node', 'node_reading', 'node_review', 'import_source']) {
    for (const [id, dirty, deleted] of [['orphan', 0, null], ['unsent', 1, null], ['deleted', 1, 'now']]) {
      db.prepare(`INSERT INTO sync_object_state
        (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
        VALUES (?, ?, ?, 'hash', 'source', 'now', ?, ?)`).run(type, id, ++seq, dirty, deleted);
    }
  }
  db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'known-deletion', ?, 'tomb-hash', 'source', 'now')`).run(++seq);
  db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'live', ?, 'live-hash', 'source', 'now')`).run(++seq);
  db.exec(`INSERT INTO sync_delivery_receipts
    (peer_id, stream_name, operation_id, object_type, object_id, payload_identity, status, created_at, updated_at)
    VALUES ('peer', 'state', 'node_reading:unsent:5', 'node_reading', 'unsent', 'hash', 'pending', 'now', 'now'),
      ('peer', 'state', 'node_reading:unsent:2', 'node_reading', 'unsent', 'old', 'accepted', 'now', 'now'),
      ('peer', 'node_version', 'node:sent-version', 'node', 'orphan', 'sent-version', 'confirmed', 'now', 'now');`);
  return db;
}

function assertRepaired(db: Database.Database) {
  expect(db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id = 'orphan'").pluck().get()).toBe(0);
  expect(db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id = 'unsent'").pluck().get()).toBe(4);
  expect(db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE deleted_at IS NOT NULL").pluck().get()).toBe(4);
  expect(db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id IN ('live', 'known-deletion')")
    .pluck().get()).toBe(2);
  expect(db.prepare('SELECT operation_id FROM sync_delivery_receipts ORDER BY operation_id').all()).toEqual([
    { operation_id: 'node:sent-version' }, { operation_id: 'node_reading:unsent:5' }
  ]);
}

it('upgrades once without removing deleted states, tombstones, unsent states or version evidence', () => {
  const db = fixture();
  const highWater = db.prepare('SELECT high_water FROM sync_state_sequence').pluck().get();
  initializeDatabaseSchema(db);
  assertRepaired(db);
  initializeDatabaseSchema(db);
  assertRepaired(db);
  expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(db.prepare('SELECT high_water FROM sync_state_sequence').pluck().get()).toBe(highWater);
});

it('rolls back all retirements and the schema version when startup fails', () => {
  const db = fixture();
  const before = db.prepare('SELECT * FROM sync_object_state ORDER BY state_seq').all();
  expect(() => initializeDatabaseSchema(db, { beforeVersionCommit: () => { throw new Error('fail'); } }))
    .toThrow('fail');
  expect(db.pragma('user_version', { simple: true })).toBe(120);
  expect(db.prepare('SELECT * FROM sync_object_state ORDER BY state_seq').all()).toEqual(before);
  expect(db.prepare('SELECT COUNT(*) FROM sync_delivery_receipts').pluck().get()).toBe(3);
});

it.each([58, COMPANION_DATABASE_VERSION])('uses the same retirement rules in companion upgrade to %s', async (version) => {
  const db = fixture();
  const port = createBetterSqliteDbPort(db);
  await port.transaction((tx) => migrateCompanionDatabase(tx, 57, version));
  assertRepaired(db);
  expect(db.pragma('user_version', { simple: true })).toBe(version);
});
