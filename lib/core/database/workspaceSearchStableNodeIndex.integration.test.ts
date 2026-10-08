// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';

import { hashTextBody } from './contentBodyBlobs.js';
import { initializeDatabaseSchema } from './migrations.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds, processSearchIndexInvalidations } from './searchIndexInvalidations.js';
import { rebuildWorkspaceSearchIndexes, syncNodeSearchIndexForNodeIds, syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';

const databases: Database.Database[] = [];
const now = '2026-10-08T00:00:00Z';
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function host() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`DROP TABLE content_blob_data; ATTACH DATABASE ':memory:' AS search;
    CREATE TABLE search.search_metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE VIRTUAL TABLE search.node_search USING fts5(title, path, content, node_id UNINDEXED,
      updated_at UNINDEXED, is_trashed UNINDEXED, tokenize='unicode61');
    CREATE VIRTUAL TABLE search.pdf_search USING fts5(title, path, text, node_id UNINDEXED, attachment_id UNINDEXED,
      page UNINDEXED, updated_at UNINDEXED, page_text_length UNINDEXED, is_trashed UNINDEXED, tokenize='unicode61');
    CREATE TABLE search.pdf_page_map (row_id INTEGER PRIMARY KEY, node_id TEXT, attachment_id TEXT, page INTEGER,
      UNIQUE(node_id, attachment_id, page))`);
  const driver = createBetterSqlite3Driver(sqlite);
  const insert = (id: string, title: string, body: string, parent: string | null = null) => {
    sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, body_blob_hash, created_at, updated_at)
      VALUES (?, ?, 'topic', ?, ?, ?, ?, ?)`).run(id, parent, title, body, hashTextBody(body), now, now);
  };
  return { sqlite, driver, insert };
}

it('indexes owned empty, BOM, NUL, Chinese, emoji and exact 1 MiB bodies after text cache removal', () => {
  const value = host();
  const bodies = ['', '\uFEFF中文 beginning\0 NUL之后 emoji😀 end', '中😀'.repeat(149796) + 'abcd'];
  expect(Buffer.byteLength(bodies[2]!)).toBe(1_048_576);
  bodies.forEach((body, index) => value.insert(`node-${index}`, ` Title ${index} `, body));
  rebuildWorkspaceSearchIndexes(value.driver);
  bodies.forEach((body, index) => expect(value.sqlite.prepare(
    'SELECT content = ? AS exact FROM search.node_search WHERE node_id = ?').get(body, `node-${index}`)).toEqual({ exact: 1 }));
  expect(value.sqlite.prepare("SELECT node_id FROM search.node_search WHERE node_search MATCH '中文'").all())
    .toEqual([{ node_id: 'node-1' }]);
  value.sqlite.exec("UPDATE nodes SET title = 'Updated' WHERE id = 'node-1'");
  syncNodeSearchIndexForNodeIds(value.driver, ['node-1']);
  expect(value.sqlite.prepare("SELECT title, content = ? AS exact FROM search.node_search WHERE node_id = 'node-1'")
    .get(bodies[1])).toEqual({ title: 'Updated', exact: 1 });
});

it('preserves descendant breadcrumbs, inherited trash state, missing seeds and restores', () => {
  const value = host();
  value.insert('parent', '  Shelf  ', '');
  value.insert('child', 'Child', '中文', 'parent');
  value.insert('grandchild', 'Grandchild', 'Other', 'child');
  for (const deleted of [now, null]) {
    value.sqlite.prepare("UPDATE nodes SET title = 'New Shelf', deleted_at = ? WHERE id = 'parent'").run(deleted);
    syncWorkspaceSearchIndexForNodeIds(value.driver, ['parent', 'missing']);
    expect(value.sqlite.prepare("SELECT path,is_trashed FROM search.node_search WHERE node_id='grandchild'").get())
      .toEqual({ path: 'New Shelf / Child', is_trashed: deleted ? 1 : 0 });
  }
});

it('retains committed content and the durable invalidation after index failure, then retries', () => {
  const value = host();
  value.insert('node', 'Committed title', 'Original');
  enqueueWorkspaceSearchInvalidationForNodeIds(value.driver, ['node'], { requestProcessing: false });
  value.sqlite.exec('ALTER TABLE search.node_search RENAME TO unavailable_index');
  expect(processSearchIndexInvalidations(value.driver)).toEqual({ failed: 1, processed: 0 });
  expect(value.sqlite.prepare('SELECT target_id,status,last_error IS NOT NULL AS failed FROM search_index_invalidations').all())
    .toEqual([{ target_id: 'node', status: 'pending', failed: 1 }]);
  expect(value.sqlite.prepare('SELECT title,content FROM nodes WHERE id = ?').get('node'))
    .toEqual({ title: 'Committed title', content: 'Original' });
  value.sqlite.exec('ALTER TABLE search.unavailable_index RENAME TO node_search');
  expect(processSearchIndexInvalidations(value.driver)).toEqual({ failed: 0, processed: 1 });
  expect(value.sqlite.prepare('SELECT COUNT(*) FROM search_index_invalidations').pluck().get()).toBe(0);
  expect(value.sqlite.prepare('SELECT content FROM search.node_search').pluck().get()).toBe('Original');
});

it('keeps background indexing deferred until the existing durable queue is processed', () => {
  const value = host();
  const body = '中😀'.repeat(149796) + 'abcd';
  value.insert('node', 'Committed title', body);
  enqueueWorkspaceSearchInvalidationForNodeIds(value.driver, ['node'], { requestProcessing: false });
  expect(value.sqlite.prepare('SELECT count(*) FROM search.node_search').pluck().get()).toBe(0);
  expect(processSearchIndexInvalidations(value.driver, 500)).toEqual({ failed: 0, processed: 1 });
  expect(value.sqlite.prepare('SELECT content = ? AS exact FROM search.node_search').get(body)).toEqual({ exact: 1 });
  expect(value.sqlite.prepare('SELECT count(*) FROM search_index_invalidations').pluck().get()).toBe(0);
});
