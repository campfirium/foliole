// @vitest-environment node
import { createRequire } from 'node:module';

import { afterEach, expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import type { SqliteDatabase } from './connection.js';
import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

const BetterSqlite3 = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');
const databases: SqliteDatabase[] = [];
function fixture() {
  const db = new BetterSqlite3(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  db.pragma('user_version = 126');
  return db;
}
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });

function seedCache(db: SqliteDatabase, rule: string, source: string) {
  db.prepare(`INSERT INTO keep_import_item_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(rule, source, `Title ${source}`, `Body ${source}`, `Preview ${source}`, 11, 22, 'then', 'unreadable');
}
function track(db: SqliteDatabase, rule: string, source: string, state: string, node: string | null) {
  db.prepare(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
    last_status, first_seen_at, last_seen_at, source_state, local_node_state, last_node_id)
    VALUES (?, ?, 11, 22, 'blocked_deleted', 'then', 'now', ?, 'locally_deleted', ?)`)
    .run(rule, source, state, node);
}

it('removes only unmatched exact pairs and preserves every tracked cache column and search row', () => {
  const db = fixture();
  track(db, 'retired-rule', '/unreadable', 'present', null);
  track(db, 'missing', '/gone', 'missing', 'nonexistent-node');
  track(db, 'deleted', '/removed', 'present', 'deleted-node');
  for (const [rule, source] of [['retired-rule', '/unreadable'], ['missing', '/gone'], ['deleted', '/removed']]) {
    seedCache(db, rule!, source!);
  }
  const kept = db.prepare('SELECT * FROM keep_import_item_cache ORDER BY rule_id, source_path').all();
  const search = db.prepare('SELECT * FROM stored_source_search ORDER BY source_key').all();
  seedCache(db, 'retired-rule', '/UnReadable');
  seedCache(db, 'other-rule', '/unreadable');
  seedCache(db, 'retired-rule', '/unreadable ');
  initializeDatabaseSchema(db);
  expect(db.prepare('SELECT * FROM keep_import_item_cache ORDER BY rule_id, source_path').all()).toEqual(kept);
  expect(db.prepare('SELECT * FROM stored_source_search ORDER BY source_key').all()).toEqual(search);
  expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('does nothing without orphan caches and never repeats after the version is committed', () => {
  const db = fixture();
  track(db, 'rule', '/path', 'missing', null);
  seedCache(db, 'rule', '/path');
  const before = db.prepare('SELECT * FROM keep_import_item_cache').all();
  initializeDatabaseSchema(db);
  expect(db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual(before);
  seedCache(db, 'new-orphan', '/path');
  initializeDatabaseSchema(db);
  expect(db.prepare('SELECT COUNT(*) AS count FROM keep_import_item_cache').get()).toEqual({ count: 2 });
});

it('rolls back cache deletes and version on failure, then permits the numbered upgrade to retry', () => {
  const db = fixture();
  seedCache(db, 'orphan', '/path');
  const before = db.prepare('SELECT * FROM keep_import_item_cache').all();
  expect(() => initializeDatabaseSchema(db, { beforeVersionCommit: () => { throw new Error('commit failure'); } }))
    .toThrow('commit failure');
  expect(db.pragma('user_version', { simple: true })).toBe(126);
  expect(db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual(before);
  db.exec(`CREATE TRIGGER reject_cache_delete BEFORE DELETE ON keep_import_item_cache
    BEGIN SELECT RAISE(ABORT, 'delete failure'); END`);
  expect(() => migrateNumberedFixtureTo(db, 127)).toThrow('delete failure');
  expect(db.pragma('user_version', { simple: true })).toBe(126);
  expect(db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual(before);
  db.exec('DROP TRIGGER reject_cache_delete');
  migrateNumberedFixtureTo(db, 127);
  expect(db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual([]);
});
