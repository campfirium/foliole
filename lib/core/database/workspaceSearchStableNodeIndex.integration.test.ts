// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { observeDriver } from '../../../electron/database/bodyContentDriver.testSupport.js';

import { BODY_CONTENT_SCHEMA } from './bodyContentSchema.js';
import { stageTextBodyContentWithDriver } from './bodyContentWriteWithDriver.js';
import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import { initializeDatabaseSchema } from './migrations.js';
import { claimSearchIndexInvalidations, completeInvalidations, enqueueWorkspaceSearchInvalidationForNodeIds,
  failInvalidations, processSearchIndexInvalidations } from './searchIndexInvalidations.js';
import { rebuildWorkspaceSearchIndexes, syncNodeSearchIndexForNodeIds, syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';

const databases: Database.Database[] = [];
const now = '2026-10-07T00:00:00Z';
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function host(stable: boolean) {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`${BODY_CONTENT_SCHEMA.join(';\n')}; ATTACH DATABASE ':memory:' AS search;
    CREATE TABLE search.search_metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE VIRTUAL TABLE search.node_search USING fts5(title, path, content, node_id UNINDEXED,
      updated_at UNINDEXED, is_trashed UNINDEXED, tokenize='unicode61');
    CREATE VIRTUAL TABLE search.pdf_search USING fts5(title, path, text, node_id UNINDEXED, attachment_id UNINDEXED,
      page UNINDEXED, updated_at UNINDEXED, page_text_length UNINDEXED, is_trashed UNINDEXED, tokenize='unicode61');
    CREATE TABLE search.pdf_page_map (row_id INTEGER PRIMARY KEY, node_id TEXT, attachment_id TEXT, page INTEGER,
      UNIQUE(node_id, attachment_id, page))`);
  const driver = createBetterSqlite3Driver(sqlite);
  const insert = (id: string, title: string, body: string, parent: string | null = null, deleted: string | null = null) => {
    const hash = stable ? stageTextBodyContentWithDriver(driver, body).hash : upsertTextBodyBlob(driver, body, now);
    sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, body_blob_hash, created_at, updated_at, deleted_at)
      VALUES (?, ?, 'topic', ?, '', ?, ?, ?, ?)`).run(id, parent, title, hash, now, now, deleted);
    return hash;
  };
  return { sqlite, driver, insert };
}

function indexed(value: ReturnType<typeof host>) {
  return value.sqlite.prepare('SELECT title, path, content, node_id, updated_at, is_trashed FROM search.node_search ORDER BY node_id').all();
}

it('indexes the same Chinese, BOM, NUL, emoji and long body bytes using one stable article at a time', () => {
  const old = host(false);
  const stable = host(true);
  const bodies = ['', '\uFEFF中文 beginning\0 NUL之后 emoji😀 end', '中😀'.repeat(500_000)];
  for (const value of [old, stable]) bodies.forEach((body, index) => value.insert(`node-${index}`, ` Title ${index} `, body));
  rebuildWorkspaceSearchIndexes(old.driver);
  const observed = observeDriver(stable.driver);
  rebuildWorkspaceSearchIndexes(observed.driver, 'chunked');
  expect(indexed(stable)).toEqual(indexed(old));
  expect(Math.max(...observed.sizes)).toBeLessThanOrEqual(512 * 1024);
  for (const term of ['中文', 'NUL之后', 'emoji']) {
    const matches = (value: typeof old) => value.sqlite.prepare(
      'SELECT node_id FROM search.node_search WHERE node_search MATCH ? ORDER BY node_id').all(term);
    expect(matches(stable)).toEqual(matches(old));
  }
  stable.sqlite.exec("UPDATE nodes SET title = 'Updated' WHERE id = 'node-1'");
  old.sqlite.exec("UPDATE nodes SET title = 'Updated' WHERE id = 'node-1'");
  syncNodeSearchIndexForNodeIds(old.driver, ['node-1']);
  syncNodeSearchIndexForNodeIds(stable.driver, ['node-1'], 'chunked');
  expect(indexed(stable)).toEqual(indexed(old));
});

it('preserves descendant breadcrumbs, inherited trash state, missing seeds and restores', () => {
  const old = host(false);
  const stable = host(true);
  for (const value of [old, stable]) {
    value.insert('parent', '  Shelf  ', '');
    value.insert('child', 'Child', '中文', 'parent');
    value.insert('grandchild', 'Grandchild', 'Other', 'child');
  }
  for (const deleted of [now, null]) {
    for (const value of [old, stable]) value.sqlite.prepare("UPDATE nodes SET title = 'New Shelf', deleted_at = ? WHERE id = 'parent'").run(deleted);
    syncWorkspaceSearchIndexForNodeIds(old.driver, ['parent', 'missing']);
    syncWorkspaceSearchIndexForNodeIds(stable.driver, ['parent', 'missing'], 'chunked');
    expect(indexed(stable)).toEqual(indexed(old));
    expect(stable.sqlite.prepare("SELECT path,is_trashed FROM search.node_search WHERE node_id='grandchild'").get())
      .toEqual({ path: 'New Shelf / Child', is_trashed: deleted ? 1 : 0 });
  }
});

it('retains a committed invalidation and data when a stable body is unavailable, then retries the existing queue', () => {
  const stable = host(true);
  const hash = stable.insert('node', 'Committed title', 'Original');
  enqueueWorkspaceSearchInvalidationForNodeIds(stable.driver, ['node'], { requestProcessing: false });
  const originalQueue = stable.sqlite.prepare('SELECT target_id,status FROM search_index_invalidations').all();
  stable.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
  const claimed = claimSearchIndexInvalidations(stable.driver);
  expect(() => syncNodeSearchIndexForNodeIds(stable.driver, ['node'], 'chunked')).toThrow('node_body_unavailable:node');
  failInvalidations(stable.driver, claimed.map((row) => row.id), new Error('body unavailable'), now);
  expect(stable.sqlite.prepare('SELECT target_id,status FROM search_index_invalidations').all()).toEqual(originalQueue);
  expect(stable.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').pluck().get('node')).toBe('Committed title');
  stageTextBodyContentWithDriver(stable.driver, 'Original');
  const retry = claimSearchIndexInvalidations(stable.driver);
  syncNodeSearchIndexForNodeIds(stable.driver, ['node'], 'chunked');
  completeInvalidations(stable.driver, retry.map((row) => row.id));
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM search_index_invalidations').pluck().get()).toBe(0);
  expect(stable.sqlite.prepare('SELECT content FROM search.node_search').pluck().get()).toBe('Original');
});

it('processes the existing claimed background queue with explicit chunked storage', () => {
  const stable = host(true);
  const body = '中😀'.repeat(500000);
  stable.insert('node', 'Committed title', body);
  enqueueWorkspaceSearchInvalidationForNodeIds(stable.driver, ['node'], { requestProcessing: false });
  expect(stable.sqlite.prepare('SELECT count(*) FROM search.node_search').pluck().get()).toBe(0);
  expect(processSearchIndexInvalidations(stable.driver, 500, 'chunked')).toEqual({ failed: 0, processed: 1 });
  expect(stable.sqlite.prepare('SELECT content FROM search.node_search').pluck().get()).toBe(body);
  expect(stable.sqlite.prepare('SELECT count(*) FROM search_index_invalidations').pluck().get()).toBe(0);
});
