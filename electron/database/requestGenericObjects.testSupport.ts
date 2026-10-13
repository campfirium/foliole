import { computeSyncContentHash, type SyncObjectType } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { openDatabaseConnection } from './connection.js';
import { flushDirtyNodeSyncVersions } from './nodeSyncVersions.js';

export function prepareGenericRequestFacts() {
  const driver = openDatabaseConnection().driver;
  flushDirtyNodeSyncVersions('2026-04-27T00:06:00.000Z');
  for (const row of driver.queryAll<{ object_type: SyncObjectType; object_id: string }>(
    'SELECT object_type, object_id FROM sync_object_state')) {
    const sql = SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[row.object_type as keyof typeof SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE];
    if (!sql) continue;
    const payload = driver.queryOne<{ payload_json: string }>(sql, [row.object_id]);
    if (payload) driver.execute('UPDATE sync_object_state SET content_hash = ? WHERE object_type = ? AND object_id = ?',
      [computeSyncContentHash(row.object_type, JSON.parse(payload.payload_json)), row.object_type, row.object_id]);
  }
}

export function insertAttachmentSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('attachment', 'att-1', 3, 'attachment-hash', 'desktop', '2026-04-27T00:02:00.000Z', 1)`
  );
}

export function insertExternalFolderSyncState() {
  const driver = openDatabaseConnection().driver;
  const contentHash = computeSyncContentHash('external_folder', {
    attachment_mode: 'document_relative_first_then_fixed_root', excluded_dirs_json: '[".git"]',
    host_name: 'desktop', host_platform: 'darwin', id: 'folder-1', source_ref: 'external:folder-1'
  });
  driver.execute(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
    host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('external:folder-1', 'external', 'folder-1', 'desktop', 'darwin',
      '/library', 'posix', '{}', '2026-04-27T00:03:00.000Z', '2026-04-27T00:03:00.000Z')`);
  driver.execute(
    `INSERT INTO external_search_folders (
       id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
       status, document_count, indexed_at, last_error, created_at, updated_at, source_ref
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['folder-1', '/library', 'document_relative_first_then_fixed_root', null, '[".git"]',
      'ready', 3, '2026-04-27T00:03:00.000Z', null,
      '2026-04-27T00:03:00.000Z', '2026-04-27T00:03:00.000Z', 'external:folder-1']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('external_folder', 'folder-1', 4, ?,
       'desktop', '2026-04-27T00:03:00.000Z', 1)`, [contentHash]
  );
}

export function insertNodeReadingSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-reading-1', 'topic', 'Reading Topic', '', '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'node-reading-1', 1, 'node-reading-node-hash',
       'desktop', '2026-04-27T00:00:00.000Z', 0)`
  );
  driver.execute(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['node-reading-1', 120000, 1.5, '2026-04-27T00:05:00.000Z',
      '2026-04-28T00:05:00.000Z', 0.75, 2, 'active']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node_reading', 'node-reading-1', 8, 'reading-hash',
       'desktop', '2026-04-27T00:05:00.000Z', 0)`
  );
}

export function insertNodeReviewSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-review-1', 'topic', 'Review Topic', '', '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'node-review-1', 1, 'node-review-node-hash',
       'desktop', '2026-04-27T00:00:00.000Z', 0)`
  );
  driver.execute(
    `INSERT INTO node_review (
       node_id, due, last_review_at, state, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['node-review-1', '2026-04-28T00:00:00.000Z', '2026-04-27T00:05:00.000Z', 2, 3, 4, 1, 1, 2, 0]
  );
  driver.execute(
    `INSERT INTO review_log (
       id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['log-1', 'op-1', 'android-test', 'node-review-1', 3, 'ts-fsrs@4',
      '2026-04-27T00:05:00.000Z', '2026-04-27T00:00:00.000Z', 1, 2,
      '2026-04-28T00:00:00.000Z', 3, 4]
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node_review', 'node-review-1', 6, 'review-hash',
       'android-test', '2026-04-27T00:05:00.000Z', 0)`
  );
}

export function insertPdfPageTextSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
     VALUES (?, ?, ?, ?, ?)`,
    ['pdf-1', 1, 'page text', 612, 792]
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('pdf_page_text', 'pdf-1:1', 7, 'pdf-page-text-hash',
       'desktop', '2026-04-27T00:05:00.000Z', 1)`
  );
}

export function insertViewStateSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES ('active_node_id', 'node-1', '2026-04-27T00:06:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('view_state', 'session_resume:windows:desktop:desktop-test:active_node', 9, 'view-hash',
       'desktop-test', '2026-04-27T00:06:00.000Z', 0)`
  );
}

export function insertImportSourceSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
       watched_binding_id, watched_relative_path
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['source-1', 'manual', 'markdown', 'notes.md', '/library/notes.md',
      '2026-04-27T00:04:00.000Z', '2026-04-27T00:04:00.000Z', 'content-1', 'node-1',
      'watched-source-1', 'notes.md']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('import_source', 'source-1', 5, 'import-source-hash',
       'desktop', '2026-04-27T00:04:00.000Z', 1)`
  );
}
