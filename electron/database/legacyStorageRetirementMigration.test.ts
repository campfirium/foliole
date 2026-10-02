// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';

import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

const databases: Database.Database[] = [];
function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);
    CREATE TABLE virtual_folders (id TEXT PRIMARY KEY, title TEXT, description TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE virtual_folder_items (id TEXT PRIMARY KEY, folder_id TEXT, material_node_id TEXT,
      position INTEGER, deleted_at TEXT);
    INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('a','A','then','now'), ('b','B','then','now');
    INSERT INTO node_order VALUES ('a',0), ('b',1);
    INSERT INTO parent_child_order VALUES ('${ROOT_CHILD_ORDER_ID}', '["b","a"]', 'newer');`);
  db.pragma('user_version = 127');
  return db;
}
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });

function legacyTables(db: Database.Database) {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type='table'
    AND name IN ('node_order','virtual_folders','virtual_folder_items') ORDER BY name`).all();
}
function cache(db: Database.Database, source: string, content: string | null, preview = content) {
  db.prepare(`INSERT INTO keep_import_items (rule_id,source_path,source_mtime_ms,source_size_bytes,
    first_seen_at,last_seen_at,last_status,source_state,local_node_state)
    VALUES ('rule',?,1,2,'then','now','blocked_deleted','present','locally_deleted')`).run(source);
  db.prepare(`INSERT INTO keep_import_item_cache VALUES ('rule',?,'Title',?,?,1,2,'then','unreadable')`)
    .run(source, content, preview);
}

it('retires obsolete tables without replaying old ordering or overwriting current virtual folders', () => {
  const db = fixture();
  db.exec(`INSERT INTO virtual_folders VALUES ('a','Old title','unused description','then','then',NULL);
    UPDATE nodes SET kind='folder', virtual_filter='{"version":1,"match":"all","conditions":[]}',
      manual_child_order='["b"]' WHERE id='a'`);
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY id').all();
  const orders = db.prepare('SELECT * FROM parent_child_order').all();
  initializeDatabaseSchema(db);
  expect(legacyTables(db)).toEqual([]);
  expect(db.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
  expect(db.prepare('SELECT * FROM parent_child_order').all()).toEqual(orders);
  expect(db.pragma('user_version', { simple: true })).toBe(128);
});

it('shortens historical duplicate previews while preserving full recovery bodies and search contents', () => {
  const db = fixture();
  const full = '# Title\n\n' + 'Recovery content unavailable from the original source. '.repeat(30);
  cache(db, 'long', full);
  cache(db, 'short', 'short');
  cache(db, 'correct', full, 'Current preview');
  cache(db, 'empty', null);
  const before = db.prepare('SELECT * FROM keep_import_item_cache ORDER BY source_path').all();
  initializeDatabaseSchema(db);
  const after = db.prepare('SELECT * FROM keep_import_item_cache ORDER BY source_path').all() as
    { source_path: string; content_preview: string | null }[];
  expect(after.filter((row) => row.source_path !== 'long')).toEqual(
    before.filter((row) => (row as { source_path: string }).source_path !== 'long'));
  const repaired = db.prepare("SELECT * FROM keep_import_item_cache WHERE source_path='long'").get();
  expect(repaired).toEqual({ ...(before.find((row) => (row as { source_path: string }).source_path === 'long') as object),
    content_preview: ('Recovery content unavailable from the original source. '.repeat(30)).slice(0, 200).trimEnd() + '…' });
  const search = db.prepare("SELECT content,metadata FROM stored_source_search WHERE source_key='rule:long'")
    .get() as { content: string; metadata: string };
  expect(search.content).toBe(full);
  expect(JSON.parse(search.metadata).contentPreview).toBe((repaired as { content_preview: string }).content_preview);
  initializeDatabaseSchema(db);
  expect(db.prepare('SELECT * FROM keep_import_item_cache ORDER BY source_path').all()).toEqual(after);
});

it('rolls back table retirement, previews and schema version when upgrading fails', () => {
  const db = fixture();
  cache(db, 'long', 'x'.repeat(500));
  const before = db.prepare('SELECT * FROM keep_import_item_cache').all();
  expect(() => initializeDatabaseSchema(db, { beforeVersionCommit: () => { throw new Error('failure'); } }))
    .toThrow('failure');
  expect(legacyTables(db)).toHaveLength(3);
  expect(db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual(before);
  expect(db.pragma('user_version', { simple: true })).toBe(127);
  initializeDatabaseSchema(db);
  expect(legacyTables(db)).toEqual([]);
});

it('converts older virtual folders and their sorting before retiring historical storage', () => {
  const db = fixture();
  db.exec(`DELETE FROM parent_child_order;
    INSERT INTO virtual_folders VALUES ('legacy','Legacy','unused','then','then',NULL);
    INSERT INTO virtual_folder_items VALUES ('membership','legacy','b',0,NULL)`);
  db.pragma('user_version = 55');
  migrateNumberedFixtureTo(db, 56);
  const folder = db.prepare("SELECT * FROM nodes WHERE id='legacy'").get();
  db.pragma('user_version = 104');
  migrateNumberedFixtureTo(db, 105);
  const orders = db.prepare('SELECT * FROM parent_child_order ORDER BY parent_id').all();
  db.pragma('user_version = 127');
  initializeDatabaseSchema(db);
  expect(legacyTables(db)).toEqual([]);
  expect(db.prepare("SELECT * FROM nodes WHERE id='legacy'").get()).toEqual(folder);
  expect(db.prepare('SELECT * FROM parent_child_order ORDER BY parent_id').all()).toEqual(orders);
});

it('never creates obsolete ordering storage in fresh databases', () => {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  expect(legacyTables(db)).toEqual([]);
});
