// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { processClaimedInvalidationRows } from '../../lib/core/database/searchIndexInvalidations.js';
import { rebuildWorkspaceSearchIndexes, syncPdfSearchIndexForAttachmentIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { prepareCachedSqliteStatement } from './sqliteStatementCache.js';
import { searchWorkspace } from './workspaceSearch.js';

const attachmentId = 'b'.repeat(64);

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-empty-pdf-search-'));
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await waitForManagedSafetySnapshotSettlements();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

function seedUnrelatedPdfs(size: number) {
  const { sqlite, driver } = openDatabaseConnection();
  const insert = sqlite.prepare(`INSERT INTO nodes
    (id, kind, title, content, resource_references, created_at, updated_at)
    VALUES (?, 'topic', ?, ?, ?, '2026-10-26', '2026-10-26')`);
  const resources = JSON.stringify([{ storage_key: `${attachmentId}.pdf`, role: 'reference', original_name: 'Source.pdf' }]);
  sqlite.transaction(() => {
    insert.run('plain', 'Plain article', 'Old article body', '[]');
    for (let index = 0; index < size; index++) insert.run(`pdf-${index}`, `PDF ${index}`, '', resources);
    sqlite.prepare("INSERT INTO pdf_index_state (attachment_id, status) VALUES (?, 'ready')").run(attachmentId);
    const page = sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)');
    page.run(attachmentId, 1, 'Unrelated PDF first page');
    page.run(attachmentId, 2, 'Unrelated PDF second page');
  })();
  rebuildWorkspaceSearchIndexes(driver);
}

function snapshotPdfIndex() {
  const { sqlite } = openDatabaseConnection();
  return {
    rows: sqlite.prepare('SELECT rowid, * FROM search.pdf_search ORDER BY node_id, page').all(),
    map: sqlite.prepare('SELECT * FROM search.pdf_page_map ORDER BY node_id, page').all()
  };
}

function measureResourceWork() {
  const { sqlite } = openDatabaseConnection();
  const builtin = new Database(':memory:');
  const extract = builtin.prepare('SELECT json_extract(?, ?) AS value');
  let calls = 0;
  // Delegate to SQLite itself so JSON semantics remain identical to production.
  sqlite.function('json_extract', (json: string, jsonPath: string) => {
    if (jsonPath === '$.storage_key') calls++;
    return (extract.get(json, jsonPath) as { value: string | number | null }).value;
  });
  // Evict statements compiled before instrumentation from the existing cache.
  for (let index = 0; index < 130; index++) prepareCachedSqliteStatement(sqlite, `SELECT ${index} AS empty_scope`);
  return {
    count: () => calls,
    reset: () => { calls = 0; },
    close: () => builtin.close()
  };
}

it.each([10, 1000])('avoids unrelated resource work for empty targets and article batches with %i PDF owners', (size) => {
  seedUnrelatedPdfs(size);
  const before = snapshotPdfIndex();
  expect(before.rows).toHaveLength(size * 2);
  expect(before.map).toHaveLength(size * 2);
  const { driver, sqlite } = openDatabaseConnection();
  const work = measureResourceWork();
  try {
    for (const ids of [[], ['', ' ', '\t', '\n']]) {
      work.reset();
      syncPdfSearchIndexForAttachmentIds(driver, ids);
      expect.soft(work.count(), `resource work for ${JSON.stringify(ids)}`).toBe(0);
      expect(snapshotPdfIndex()).toEqual(before);
    }
    sqlite.prepare("UPDATE nodes SET content = 'RevisedArticleSentinel body' WHERE id = 'plain'").run();
    work.reset();
    processClaimedInvalidationRows(driver, [{ id: 1, invalidation_type: 'node_workspace', target_id: 'plain' }]);
    expect.soft(work.count(), 'resource work for ordinary article update').toBe(0);
    expect(searchWorkspace('RevisedArticleSentinel').map((result) => result.id)).toEqual(['plain']);
    expect(sqlite.prepare("SELECT content FROM search.node_search WHERE node_id = 'plain'").get())
      .toEqual({ content: 'RevisedArticleSentinel body' });
    expect(snapshotPdfIndex()).toEqual(before);
    // A normalized nonempty target must still discover every holder and refresh page text.
    sqlite.prepare("UPDATE pdf_page_text SET text = 'Updated PDF first page' WHERE attachment_id = ? AND page = 1").run(attachmentId);
    work.reset();
    syncPdfSearchIndexForAttachmentIds(driver, [` ${attachmentId} `, attachmentId]);
    expect(work.count()).toBeGreaterThan(0);
    expect(sqlite.prepare("SELECT DISTINCT text FROM search.pdf_search WHERE page = '1'").all())
      .toEqual([{ text: 'Updated PDF first page' }]);
    expect(snapshotPdfIndex().map).toEqual(sqlite.prepare(`SELECT rowid AS row_id, node_id, attachment_id,
      CAST(page AS INTEGER) AS page FROM search.pdf_search ORDER BY node_id, page`).all());
    expect(snapshotPdfIndex().rows).toHaveLength(size * 2);
  } finally {
    work.close();
  }
});
