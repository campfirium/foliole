// @vitest-environment node
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { adoptVerifiedBody, stageTextBodyContent } from '../sync/bodyContentWrite.js';

import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { migrateBodyContentOwners } from './bodyContentOwnerMigration.js';
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
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
}

it.each(['', null, '\ufeff中😀\0文'.repeat(300000)])('keeps original FTS fields while independently indexing stable bodies', async (body) => {
  const old = textDevice(); const stable = textDevice();
  try {
    for (const host of [old, stable]) seed(host, body);
    const original = rows(old);
    await upgrade(stable);
    expect(rows(stable)).toEqual(original);
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

it('keeps committed sources and pending generations after indexing failure, then retries after content is available', async () => {
  const host = textDevice();
  try {
    seed(host, 'Original'); await upgrade(host);
    const driver = createBetterSqlite3Driver(host.sqlite);
    expect(processSearchIndexInvalidations(driver).failed).toBe(0);
    const ref = await stageTextBodyContent(host.db, 'Replacement');
    await adoptVerifiedBody(host.db, ref, now);
    host.sqlite.prepare('UPDATE external_documents SET body_blob_hash = ?, title = ?').run(ref.hash, 'Committed title');
    host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(ref.hash);
    const before = rows(host);
    expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 1, processed: 0 });
    expect(rows(host)).toEqual(before);
    expect(host.sqlite.prepare('SELECT title FROM external_documents').pluck().get()).toBe('Committed title');
    expect(host.sqlite.prepare('SELECT status, last_error FROM search_index_invalidations').get())
      .toEqual({ status: 'pending', last_error: `stored_source_body_unavailable:${ref.hash}` });
    await stageTextBodyContent(host.db, 'Replacement');
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
