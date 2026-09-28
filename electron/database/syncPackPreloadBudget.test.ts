// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { buildSyncPackNodesTableSql } from '../../lib/core/sync/syncPackNodeFields.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { assertSyncPackPreloadBudget } from './syncPackPreloadBudget.js';

it('checks generic payload and tombstone bytes before JS row loading', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT,
        state_seq INTEGER, deleted_at TEXT);
      CREATE TABLE node_text_alternatives (alternative_id TEXT, body_text TEXT);
      ${buildSyncPackNodesTableSql()};
      CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT);
      CREATE TABLE review_log (node_id TEXT);
      CREATE TABLE parent_child_order (parent_id TEXT, child_ids_json TEXT);
      CREATE TABLE setting_records (scope TEXT, platform TEXT, form_factor TEXT,
        host_name TEXT, key TEXT, value_json TEXT);
      CREATE TABLE node_sync_tombstones (node_id TEXT, snapshot_json TEXT);`);
    sqlite.exec(`CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
      CREATE TABLE import_sources (source_fingerprint TEXT, remote_annotations_json TEXT,
        remote_import_state_json TEXT);
      CREATE TABLE external_search_folders (id TEXT, source_ref TEXT, excluded_dirs_json TEXT);
      CREATE TABLE desktop_sources (source_ref TEXT, type_settings_json TEXT);`);
    sqlite.prepare("INSERT INTO sync_object_state VALUES ('node_text_alternative', 'large', 1, NULL)").run();
    sqlite.prepare("INSERT INTO node_text_alternatives VALUES ('large', ?)")
      .run('x'.repeat(2 * 1024 * 1024));
    const driver = createBetterSqlite3Driver(sqlite);
    const budget = { applyRows: 128, databaseBytes: 1024 * 1024,
      transferBytes: 1024 * 1024 };
    expect(() => assertSyncPackPreloadBudget(driver, 0, 1, budget))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
    expect(() => assertSyncPackPreloadBudget(driver, 1, 1, budget)).not.toThrow();
    sqlite.prepare("INSERT INTO sync_object_state VALUES ('node', 'deleted', 2, 'now')").run();
    sqlite.prepare("INSERT INTO node_sync_tombstones VALUES ('deleted', ?)")
      .run('y'.repeat(2 * 1024 * 1024));
    expect(() => assertSyncPackPreloadBudget(driver, 1, 1, budget))
      .not.toThrow();
    expect(() => assertSyncPackPreloadBudget(driver, 1, 2, budget))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
    sqlite.prepare("INSERT INTO sync_object_state VALUES ('import_source', 'large', 3, NULL)").run();
    sqlite.prepare('INSERT INTO import_sources VALUES (?, ?, ?)')
      .run('large', 'z'.repeat(2 * 1024 * 1024), null);
    expect(() => assertSyncPackPreloadBudget(driver, 2, 3, budget))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
    sqlite.prepare("INSERT INTO sync_object_state VALUES ('external_folder', 'folder', 4, NULL)").run();
    sqlite.prepare('INSERT INTO desktop_sources VALUES (?, ?)')
      .run('source', 'a'.repeat(2 * 1024 * 1024));
    sqlite.prepare('INSERT INTO external_search_folders VALUES (?, ?, ?)')
      .run('folder', 'source', null);
    expect(() => assertSyncPackPreloadBudget(driver, 3, 4, budget))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
  } finally { sqlite.close(); }
});

it('stops an oversized ancestor closure before loading its rows', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT,
        state_seq INTEGER, deleted_at TEXT);
      ${buildSyncPackNodesTableSql()};
      CREATE TABLE node_text_alternatives (alternative_id TEXT, body_text TEXT);
      CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT);
      CREATE TABLE review_log (node_id TEXT);
      CREATE TABLE parent_child_order (parent_id TEXT, child_ids_json TEXT);
      CREATE TABLE setting_records (scope TEXT, platform TEXT, form_factor TEXT,
        host_name TEXT, key TEXT, value_json TEXT);
      CREATE TABLE node_sync_tombstones (node_id TEXT, snapshot_json TEXT);`);
    sqlite.exec(`CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
      CREATE TABLE import_sources (source_fingerprint TEXT, remote_annotations_json TEXT,
        remote_import_state_json TEXT);
      CREATE TABLE external_search_folders (id TEXT, source_ref TEXT, excluded_dirs_json TEXT);
      CREATE TABLE desktop_sources (source_ref TEXT, type_settings_json TEXT);`);
    sqlite.exec(`INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at)
      VALUES ('root', NULL, 'folder', 'Root', 'now', 'now'),
      ('child', 'root', 'folder', 'Child', 'now', 'now'),
      ('leaf', 'child', 'article', 'Leaf', 'now', 'now');
      INSERT INTO sync_object_state VALUES ('node', 'leaf', 1, NULL);`);
    expect(() => assertSyncPackPreloadBudget(createBetterSqlite3Driver(sqlite), 0, 1,
      { applyRows: 2, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024 }))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
  } finally { sqlite.close(); }
});

it('rejects an oversized node image field before materializing its row', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT,
        state_seq INTEGER, deleted_at TEXT);
      ${buildSyncPackNodesTableSql()};
      CREATE TABLE node_text_alternatives (alternative_id TEXT, body_text TEXT);
      CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT);
      CREATE TABLE review_log (node_id TEXT);
      CREATE TABLE parent_child_order (parent_id TEXT, child_ids_json TEXT);
      CREATE TABLE setting_records (scope TEXT, platform TEXT, form_factor TEXT,
        host_name TEXT, key TEXT, value_json TEXT);
      CREATE TABLE node_sync_tombstones (node_id TEXT, snapshot_json TEXT);
      INSERT INTO sync_object_state VALUES ('node', 'large', 1, NULL);`);
    sqlite.exec(`CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
      CREATE TABLE import_sources (source_fingerprint TEXT, remote_annotations_json TEXT,
        remote_import_state_json TEXT);
      CREATE TABLE external_search_folders (id TEXT, source_ref TEXT, excluded_dirs_json TEXT);
      CREATE TABLE desktop_sources (source_ref TEXT, type_settings_json TEXT);`);
    sqlite.prepare(`INSERT INTO nodes (id, kind, title, image_sources, created_at, updated_at)
      VALUES ('large', 'article', 'Large', ?, 'now', 'now')`)
      .run('x'.repeat(2 * 1024 * 1024));
    expect(() => assertSyncPackPreloadBudget(createBetterSqlite3Driver(sqlite), 0, 1,
      { applyRows: 128, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024 }))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
    sqlite.prepare('UPDATE nodes SET image_sources = NULL, content = ? WHERE id = ?')
      .run('x'.repeat(2 * 1024 * 1024), 'large');
    expect(() => assertSyncPackPreloadBudget(createBetterSqlite3Driver(sqlite), 0, 1,
      { applyRows: 128, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024 }))
      .not.toThrow();
    const insertAttachment = sqlite.prepare('INSERT INTO node_attachments VALUES (?, ?)');
    for (let index = 0; index < 128; index += 1) {
      insertAttachment.run('large', `attachment-${index}`);
    }
    expect(() => assertSyncPackPreloadBudget(createBetterSqlite3Driver(sqlite), 0, 1,
      { applyRows: 128, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024 }))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
  } finally { sqlite.close(); }
});

it('counts all review facts attached to a selected review state', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT,
        state_seq INTEGER, deleted_at TEXT);
      ${buildSyncPackNodesTableSql()};
      CREATE TABLE node_text_alternatives (alternative_id TEXT, body_text TEXT);
      CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT);
      CREATE TABLE review_log (node_id TEXT);
      CREATE TABLE parent_child_order (parent_id TEXT, child_ids_json TEXT);
      CREATE TABLE setting_records (scope TEXT, platform TEXT, form_factor TEXT,
        host_name TEXT, key TEXT, value_json TEXT);
      CREATE TABLE node_sync_tombstones (node_id TEXT, snapshot_json TEXT);
      INSERT INTO sync_object_state VALUES ('node_review', 'node', 1, NULL);
      INSERT INTO review_log VALUES ('node'), ('node'), ('node');`);
    sqlite.exec(`CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
      CREATE TABLE import_sources (source_fingerprint TEXT, remote_annotations_json TEXT,
        remote_import_state_json TEXT);
      CREATE TABLE external_search_folders (id TEXT, source_ref TEXT, excluded_dirs_json TEXT);
      CREATE TABLE desktop_sources (source_ref TEXT, type_settings_json TEXT);`);
    expect(() => assertSyncPackPreloadBudget(createBetterSqlite3Driver(sqlite), 0, 1,
      { applyRows: 3, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024 }))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
  } finally { sqlite.close(); }
});

it('rejects a large child order before creating its JSON payload', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT,
        state_seq INTEGER, deleted_at TEXT);
      ${buildSyncPackNodesTableSql()};
      CREATE TABLE node_text_alternatives (alternative_id TEXT, body_text TEXT);
      CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT);
      CREATE TABLE review_log (node_id TEXT);
      CREATE TABLE parent_child_order (parent_id TEXT, child_ids_json TEXT);
      CREATE TABLE setting_records (scope TEXT, platform TEXT, form_factor TEXT,
        host_name TEXT, key TEXT, value_json TEXT);
      CREATE TABLE node_sync_tombstones (node_id TEXT, snapshot_json TEXT);
      INSERT INTO sync_object_state VALUES ('parent_child_order', 'parent', 1, NULL);`);
    sqlite.exec(`CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
      CREATE TABLE import_sources (source_fingerprint TEXT, remote_annotations_json TEXT,
        remote_import_state_json TEXT);
      CREATE TABLE external_search_folders (id TEXT, source_ref TEXT, excluded_dirs_json TEXT);
      CREATE TABLE desktop_sources (source_ref TEXT, type_settings_json TEXT);`);
    sqlite.prepare('INSERT INTO parent_child_order VALUES (?, ?)')
      .run('parent', 'x'.repeat(2 * 1024 * 1024));
    expect(() => assertSyncPackPreloadBudget(createBetterSqlite3Driver(sqlite), 0, 1,
      { applyRows: 128, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024 }))
      .toThrow('sync_pack_page_preflight_exceeds_budget');
  } finally { sqlite.close(); }
});
