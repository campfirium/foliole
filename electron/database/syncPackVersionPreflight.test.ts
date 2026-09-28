// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { assertSyncPackVersionBudget } from './syncPackVersionPreflight.js';

it('rejects a giant version chain before loading version bodies into JavaScript', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, current_version_id TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      parent_version_id TEXT, body_text TEXT, snapshot_json TEXT);
    CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT, ordinal INTEGER);`);
  const driver = createBetterSqlite3Driver(sqlite);
  const body = 'A'.repeat(4 * 1024 * 1024);
  driver.execute(`INSERT INTO nodes (id, content, current_version_id)
    VALUES ('large', ?, 'v2')`, [body]);
  driver.execute(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, body_text, snapshot_json) VALUES
    ('v1', 'large', NULL, ?, ?),
    ('v2', 'large', 'v1', ?, ?)`,
  [body, JSON.stringify({ content: body }), body, JSON.stringify({ content: body })]);
  const node = driver.queryOne<{ id: string; current_version_id: string }>(
    'SELECT id, current_version_id FROM nodes WHERE id = ?', ['large']
  )!;
  expect(() => assertSyncPackVersionBudget(driver, [node], {
    applyRows: 100, databaseBytes: 1024 * 1024, transferBytes: 1024 * 1024
  })).toThrow('sync_pack_page_preflight_exceeds_budget');
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', ['large'])?.content)
    .toBe(body);
  sqlite.close();
});
