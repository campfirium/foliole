// @vitest-environment node
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';

import { claimSearchIndexInvalidations, completeInvalidations, processClaimedInvalidationRows, processSearchIndexInvalidations } from './searchIndexInvalidations.js';
import { migrateStoredSourceSearchQueue } from './storedSourceSearchQueueMigration.js';

const now = '2026-10-07T00:00:00.000Z';
type Host = ReturnType<typeof textDevice>;

function seed(host: Host, body: string | null) {
  host.sqlite.prepare(`INSERT INTO external_documents (document_id, folder_id, relative_path, file_name,
    extension, source_size_bytes, source_modified_at, source_modified_ms, content_hash, title, content,
    indexed_at, created_at, updated_at) VALUES ('document', 'folder', 'Doc.md', 'Doc.md', 'md', 1, ?, 1,
    'original-identity', 'Original title', ?, ?, ?, ?)`).run(now, body ?? '', now, now, now);
  host.sqlite.prepare(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
    local_node_state, last_status, first_seen_at, last_seen_at, deleted_at)
    VALUES ('rule', 'source.md', 1, 1, 'locally_deleted', 'blocked_deleted', ?, ?, ?)`).run(now, now, now);
  host.sqlite.prepare(`INSERT INTO keep_import_item_cache (rule_id, source_path, title, content, content_preview,
    source_mtime_ms, source_size_bytes, refreshed_at) VALUES ('rule', 'source.md', 'Removed', ?, 'Preview', 1, 1, ?)`)
    .run(body, now);
}

const rows = (host: Host) => host.sqlite.prepare('SELECT * FROM stored_source_search ORDER BY kind, source_key').all();

async function upgrade(host: Host) {
  await host.db.transaction(async (tx) => {
    await migrateStoredSourceSearchQueue(tx);
  });
}

it.each(['', null, '\ufeff中😀\0文'.repeat(60000)])('keeps original FTS fields while indexing full owned source bodies', async (body) => {
  const old = textDevice(); const stable = textDevice();
  try {
    for (const host of [old, stable]) seed(host, body);
    const original = rows(old);
    await upgrade(stable);
    expect(rows(stable)).toEqual(original);
    stable.sqlite.exec('UPDATE external_documents SET content = content; UPDATE keep_import_item_cache SET content = content');
    expect(stable.sqlite.prepare('SELECT count(*) FROM search_index_invalidations').pluck().get()).toBeGreaterThan(0);
    const driver = createBetterSqlite3Driver(stable.sqlite);
    const result = processSearchIndexInvalidations(driver);
    expect(result.failed).toBe(0); expect(result.processed).toBeGreaterThan(0);
    expect(rows(stable)).toEqual(original);
    expect(stable.sqlite.prepare('SELECT count(*) FROM search_index_invalidations').pluck().get()).toBe(0);
    for (const sql of ["UPDATE external_documents SET document_id = 'renamed', title = 'Changed'",
      "UPDATE keep_import_items SET local_node_state = 'imported'", 'DELETE FROM external_documents']) {
      old.sqlite.exec(sql); stable.sqlite.exec(sql);
      expect(processSearchIndexInvalidations(driver).failed).toBe(0);
      expect(rows(stable)).toEqual(rows(old));
    }
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('keeps committed sources and pending generations after index failure, then retries', async () => {
  const host = textDevice();
  try {
    seed(host, 'Original'); await upgrade(host);
    const driver = createBetterSqlite3Driver(host.sqlite);
    expect(processSearchIndexInvalidations(driver).failed).toBe(0);
    host.sqlite.exec("UPDATE external_documents SET content = 'Replacement', title = 'Committed title'");
    const before = rows(host);
    host.sqlite.exec('ALTER TABLE stored_source_search RENAME TO unavailable_source_search');
    expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 1, processed: 0 });
    expect(host.sqlite.prepare('SELECT * FROM unavailable_source_search ORDER BY kind, source_key').all()).toEqual(before);
    expect(host.sqlite.prepare('SELECT title, content FROM external_documents').get())
      .toEqual({ title: 'Committed title', content: 'Replacement' });
    expect(host.sqlite.prepare('SELECT status, last_error FROM search_index_invalidations').get())
      .toMatchObject({ status: 'pending', last_error: expect.stringContaining('stored_source_search') });
    host.sqlite.exec('ALTER TABLE unavailable_source_search RENAME TO stored_source_search');
    expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 0, processed: 1 });
    expect(host.sqlite.prepare("SELECT title, content FROM stored_source_search WHERE kind = 'external'").get())
      .toEqual({ title: 'Committed title', content: 'Replacement' });
  } finally { host.sqlite.close(); }
});

it('does not retire a newer source generation when completing an older worker claim', async () => {
  const host = textDevice();
  try {
    seed(host, 'Original'); await upgrade(host);
    const driver = createBetterSqlite3Driver(host.sqlite);
    const claimed = claimSearchIndexInvalidations(driver);
    processClaimedInvalidationRows(driver, claimed);
    host.sqlite.exec("UPDATE external_documents SET title = 'Newer title'");
    completeInvalidations(driver, claimed.map((row) => row.id));
    expect(host.sqlite.prepare('SELECT target_id FROM search_index_invalidations').pluck().all()).toEqual(['document']);
    expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 0, processed: 1 });
    expect(host.sqlite.prepare("SELECT title FROM stored_source_search WHERE kind = 'external'").pluck().get()).toBe('Newer title');
  } finally { host.sqlite.close(); }
});
