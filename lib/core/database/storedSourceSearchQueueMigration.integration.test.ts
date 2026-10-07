// @vitest-environment node
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';

import { claimSearchIndexInvalidations } from './searchIndexInvalidations.js';
import { DELETE_NODE_SEARCH_PENDING_SQL, normalizeSearchPendingStates, retireSearchPendingThrough } from './searchPendingState.js';
import { enqueueStoredSourceSearchInvalidation } from './storedSourceSearchInvalidations.js';
import { migrateStoredSourceSearchQueue } from './storedSourceSearchQueueMigration.js';

const now = '2026-10-07T00:00:00.000Z';
type Host = ReturnType<typeof textDevice>;
function external(host: Host, id = 'document', body = 'Original body') {
  host.sqlite.prepare(`INSERT INTO external_documents (document_id, folder_id, relative_path, file_name,
    extension, source_size_bytes, source_modified_at, source_modified_ms, content_hash, title, content,
    indexed_at, created_at, updated_at) VALUES (?, 'folder', ?, 'Document.md', 'md', 1, ?, 1, ?, 'Original title', ?, ?, ?, ?)`)
    .run(id, `${id}.md`, now, 'a'.repeat(64), body, now, now, now);
}
function removed(host: Host, sourcePath = 'source.md') {
  host.sqlite.prepare(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
    local_node_state, last_status, first_seen_at, last_seen_at, deleted_at)
    VALUES ('rule', ?, 1, 1, 'locally_deleted', 'blocked_deleted', ?, ?, ?)`)
    .run(sourcePath, now, now, now);
  host.sqlite.prepare(`INSERT INTO keep_import_item_cache (rule_id, source_path, title, content,
    content_preview, source_mtime_ms, source_size_bytes, refreshed_at) VALUES ('rule', ?, 'Removed title',
    'Original removed body', 'Preview', 1, 1, ?)`).run(sourcePath, now);
}
function queue(host: Host) {
  return createBetterSqlite3Driver(host.sqlite).queryAll<{ [column: string]: unknown;
    id: number; target_id: string; invalidation_type: string }>(
    'SELECT * FROM search_index_invalidations ORDER BY id');
}
function search(host: Host) {
  return host.sqlite.prepare('SELECT * FROM stored_source_search ORDER BY kind, source_key').all();
}
function upgrade(host: Host) { return host.db.transaction(migrateStoredSourceSearchQueue); }

it('preserves every queue field and the generation high-water mark during the unregistered upgrade', async () => {
  const host = textDevice();
  try {
    for (const status of ['pending', 'running', 'failed', 'completed']) {
      host.sqlite.prepare(`INSERT INTO search_index_invalidations (invalidation_type, target_id, status,
        attempts, last_error, created_at, updated_at, claimed_at, completed_at)
        VALUES ('attachment_pdf', ?, ?, 3, 'Original error', ?, ?, ?, ?)`)
        .run(status, status, now, now, now, now);
    }
    host.sqlite.prepare(`INSERT INTO search_index_invalidations (id, invalidation_type, target_id, created_at, updated_at)
      VALUES (100, 'node_workspace', 'removed-generation', ?, ?)`).run(now, now);
    host.sqlite.prepare('DELETE FROM search_index_invalidations WHERE id = 100').run();
    const initial = queue(host);
    const version = host.sqlite.pragma('user_version', { simple: true });
    await upgrade(host);
    expect(queue(host)).toEqual(initial);
    expect(host.sqlite.pragma('user_version', { simple: true })).toBe(version);
    external(host);
    expect(host.sqlite.prepare("SELECT id FROM search_index_invalidations WHERE target_id = 'document'").pluck().get()).toBe(101);
  } finally { host.sqlite.close(); }
});

it('queues external updates, key changes, absence and deletion while preserving the prior FTS until background work', async () => {
  const old = textDevice();
  const stable = textDevice();
  try {
    for (const host of [old, stable]) external(host, 'document', '中文🙂'.repeat(300000));
    const original = search(stable);
    await upgrade(stable);
    for (const sql of ["UPDATE external_documents SET content = '', title = 'Changed title'",
      "UPDATE external_documents SET document_id = 'renamed'", 'UPDATE external_documents SET is_present = 0',
      'DELETE FROM external_documents']) {
      old.sqlite.exec(sql);
      stable.sqlite.exec(sql);
      expect(search(stable)).toEqual(original);
    }
    expect(search(old)).toEqual([]);
    expect(queue(stable)).toMatchObject([
      { invalidation_type: 'stored_source_external', target_id: 'document', status: 'pending' },
      { invalidation_type: 'stored_source_external', target_id: 'renamed', status: 'pending' }
    ]);
    expect(stable.sqlite.prepare('SELECT count(*) FROM external_documents').pluck().get()).toBe(0);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('queues both removed source keys for item/cache changes and keeps nonmatching caches independent', async () => {
  const old = textDevice();
  const stable = textDevice();
  try {
    for (const host of [old, stable]) removed(host);
    const original = search(stable);
    await upgrade(stable);
    for (const sql of ["UPDATE keep_import_item_cache SET content = NULL, title = 'New title'",
      "UPDATE keep_import_item_cache SET source_path = 'other.md'",
      "UPDATE keep_import_items SET source_path = 'other.md'", "UPDATE keep_import_items SET local_node_state = 'imported'",
      'DELETE FROM keep_import_item_cache', 'DELETE FROM keep_import_items']) {
      old.sqlite.exec(sql);
      stable.sqlite.exec(sql);
      expect(search(stable)).toEqual(original);
    }
    expect(search(old)).toEqual([]);
    expect(queue(stable).map((row) => row.target_id).sort()).toEqual(['rule:other.md', 'rule:source.md']);
    removed(stable, 'inserted.md');
    expect(queue(stable)).toEqual(expect.arrayContaining([expect.objectContaining({ target_id: 'rule:inserted.md' })]));
    expect(search(stable)).toEqual(original);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('rolls back business changes and the replaced pending generation when enqueue fails', async () => {
  const host = textDevice();
  try {
    await upgrade(host);
    external(host);
    const initial = queue(host);
    host.sqlite.exec("CREATE TRIGGER reject_stored_source BEFORE INSERT ON search_index_invalidations BEGIN SELECT RAISE(ABORT, 'reject_enqueue'); END");
    await expect(host.db.transaction((tx) => tx.run("UPDATE external_documents SET title = 'Changed'")))
      .rejects.toThrow('reject_enqueue');
    expect(queue(host)).toEqual(initial);
    expect(host.sqlite.prepare('SELECT title FROM external_documents').pluck().get()).toBe('Original title');
  } finally { host.sqlite.close(); }
});

it('restores the original queue and all nine FTS triggers when the upgrade transaction fails', async () => {
  const host = textDevice();
  try {
    external(host);
    const initial = queue(host);
    const triggers = host.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'stored_search_%' ORDER BY name").all();
    await expect(host.db.transaction(async (tx) => {
      await migrateStoredSourceSearchQueue(tx);
      await tx.run(`INSERT INTO search_index_invalidations (invalidation_type, target_id, created_at, updated_at)
        VALUES ('invalid_type', 'failure', ?, ?)`, [now, now]);
    })).rejects.toThrow('CHECK constraint failed');
    expect(queue(host)).toEqual(initial);
    expect(host.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'stored_search_%' ORDER BY name").all()).toEqual(triggers);
    host.sqlite.exec("UPDATE external_documents SET title = 'Old trigger still active'");
    expect(search(host)).toMatchObject([{ title: 'Old trigger still active' }]);
    await upgrade(host);
  } finally { host.sqlite.close(); }
});

it('isolates same-id stored sources from node cleanup, normalization, claims and full-rebuild retirement', async () => {
  const host = textDevice();
  try {
    await upgrade(host);
    external(host, 'same');
    await host.db.transaction((tx) => enqueueStoredSourceSearchInvalidation(tx,
      { type: 'stored_source_removed', sourceKey: 'same', timestamp: now }));
    const driver = createBetterSqlite3Driver(host.sqlite);
    driver.execute(`INSERT INTO search_index_invalidations (invalidation_type, target_id, status, created_at, updated_at)
      VALUES ('node_pdf', 'same', 'running', ?, ?)`, [now, now]);
    driver.execute(DELETE_NODE_SEARCH_PENDING_SQL, ['same']);
    expect(queue(host)).toHaveLength(2);
    driver.execute("UPDATE search_index_invalidations SET status = 'failed', last_error = 'Retry'");
    normalizeSearchPendingStates(driver);
    expect(queue(host).map((row) => row.invalidation_type).sort()).toEqual(['stored_source_external', 'stored_source_removed']);
    expect(claimSearchIndexInvalidations(driver).map((row) => row.invalidation_type).sort())
      .toEqual(['stored_source_external', 'stored_source_removed']);
    retireSearchPendingThrough(driver, Number.MAX_SAFE_INTEGER);
    expect(queue(host)).toHaveLength(2);
    expect(queue(host)).toEqual(expect.arrayContaining([expect.objectContaining({ target_id: 'same', status: 'pending', attempts: 1 })]));
  } finally { host.sqlite.close(); }
});

it('keeps a newer stored-source dirty generation when an older reader retires its own row', async () => {
  const host = textDevice();
  try {
    await upgrade(host);
    external(host);
    const driver = createBetterSqlite3Driver(host.sqlite);
    const [claimed] = claimSearchIndexInvalidations(driver);
    if (!claimed) throw new Error('stored_source_generation_missing');
    host.sqlite.exec("UPDATE external_documents SET body_blob_hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', content = ''");
    const next = queue(host);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBeGreaterThan(claimed.id);
    driver.execute('DELETE FROM search_index_invalidations WHERE id = ?', [claimed.id]);
    expect(queue(host)).toEqual(next);
    expect(host.sqlite.prepare('SELECT body_blob_hash, content FROM external_documents').get()).toEqual({
      body_blob_hash: 'b'.repeat(64), content: ''
    });
  } finally { host.sqlite.close(); }
});
