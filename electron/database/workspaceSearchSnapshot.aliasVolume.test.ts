// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';

import { expect, it, vi } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import { nodeSqliteTestDriver } from './nodeSqlite.testSupport.js';
import { beginWorkspaceSearch, loadWorkspaceSearchBatch, releaseWorkspaceSearch } from './workspaceSearchSnapshot.js';

const settings = vi.hoisted(() => ({
  driver: undefined as DatabaseDriver | undefined,
  groups: [['summary', 'ok']]
}));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ driver: settings.driver }),
  registerDatabaseConnectionCleanup: () => undefined
}));
vi.mock('./searchAliasMirror.js', () => ({
  getEffectiveSearchAliases: () => ({ groups: settings.groups, revision: 1 })
}));
vi.mock('./externalSearchCache.js', () => ({ searchExternalDocuments: () => [] }));
vi.mock('./storedRemovedSourceSearch.js', () => ({ searchRemovedSources: () => [] }));

it('starts and pages through an alias search matching more PDF pages than JavaScript can pass as arguments', () => {
  const sqlite = new DatabaseSync(':memory:');
  settings.driver = nodeSqliteTestDriver(sqlite);
  try {
    sqlite.exec(`ATTACH DATABASE ':memory:' AS search;
      CREATE VIRTUAL TABLE search.node_search USING fts5(node_id UNINDEXED, title, path, content,
        updated_at UNINDEXED, is_trashed UNINDEXED, tokenize='trigram');
      CREATE VIRTUAL TABLE search.pdf_search USING fts5(node_id UNINDEXED, title, path, text,
        attachment_id UNINDEXED, page UNINDEXED, updated_at UNINDEXED, page_text_length UNINDEXED,
        is_trashed UNINDEXED, tokenize='trigram');
      CREATE TABLE search.pdf_page_map (row_id INTEGER PRIMARY KEY, node_id TEXT, attachment_id TEXT, page INTEGER);
      WITH RECURSIVE pages(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM pages WHERE n < 500000)
      INSERT INTO search.pdf_search
      SELECT 'topic-' || (n % 85), 'Document', '', 'ok', 'attachment-' || (n % 85),
        (n / 85) + 1, '2026-10-01', 2, 0 FROM pages;`);

    const first = beginWorkspaceSearch('summary');
    expect(first.results).toHaveLength(40);
    expect(first.hasMore).toBe(true);
    const middle = loadWorkspaceSearchBatch(first.snapshotId, 40);
    const last = loadWorkspaceSearchBatch(first.snapshotId, 80);
    expect(middle.results).toHaveLength(40);
    expect(last.results).toHaveLength(5);
    expect(last.hasMore).toBe(false);
    const all = [...first.results, ...middle.results, ...last.results];
    expect(new Set(all.map(result => result.id)).size).toBe(85);
    expect(all.every(result => result.kind === 'pdf' && result.pdfMatch?.query === 'ok')).toBe(true);
    releaseWorkspaceSearch(first.snapshotId);
  } finally {
    settings.driver = undefined;
    sqlite.close();
  }
}, 20000);
