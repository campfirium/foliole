// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { readPackRowsFromZip } from './syncPackZipReaderTestSupport.js';

export let mockedSyncPackBuilderAppDataDir = '/tmp/foliole-sync-pack-builder-tests';
let tempRoot = '';

export function setupSyncPackBuilderTestLifecycle() {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-builder-'));
    mockedSyncPackBuilderAppDataDir = path.join(tempRoot, 'app-data');
    initializeDatabaseConnection(openDatabaseConnection());
  });

  afterEach(async () => {
    closeDatabaseConnection();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
}

export function resolveSyncPackPath(fileName: string) {
  return path.join(tempRoot, fileName);
}

export function insertNodeSyncState() {
  const driver = openDatabaseConnection().driver;
  const bodyHash = upsertTextBodyBlob(driver, 'node body must stay out of pack', '2026-04-27T00:00:00.000Z');
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, opening_text, content, body_blob_hash,
       current_version_id, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?, ?, ?)`,
    ['node-1', 'Node 1', 'Node opening preview', 'node body must stay out of pack', bodyHash,
      'desktop#node-1-v1', '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', '2026-04-27T00:00:00.000Z', 1)`
  );
  driver.execute(
    `INSERT INTO setting_records (
       key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at
     ) VALUES ('app_settings', 'user_space', 'windows', 'desktop', '*', '{"theme":"dark"}',
       'setting-hash', '2026-04-27T00:01:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('setting', 'user_space:windows:desktop:*:app_settings', 2, 'setting-hash',
       'desktop', '2026-04-27T00:01:00.000Z', 1)`
  );
}

export function insertAttachmentSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-1', 'cover.png', 'image/png', 12, '2026-04-27T00:02:00.000Z']
  );
  driver.execute(
    `INSERT INTO attachment_blobs (
       attachment_id, content_hash, storage_key, size_bytes, mime_type,
       availability, source_device_id, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['att-1', 'sha256:att-1', 'attachments/sha256-att-1.png', 12, 'image/png',
      'local', 'desktop-fixture', '2026-04-27T00:02:00.000Z',
      '2026-04-27T00:02:00.000Z', '2026-04-27T00:02:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('attachment', 'att-1', 3, 'attachment-hash', 'desktop', '2026-04-27T00:02:00.000Z', 1)`
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
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
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
       id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['log-1', 'op-1', 'android-test', 'node-review-1', 3, 'ts-fsrs@4',
      '2026-04-27T00:05:00.000Z', '2026-04-27T00:00:00.000Z', 1, 2,
      '2026-04-28T00:00:00.000Z', 3, 4]
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node_review', 'node-review-1', 6, 'review-hash',
       'android-test', '2026-04-27T00:05:00.000Z', 0)`
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
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
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
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node_reading', 'node-reading-1', 8, 'reading-hash',
       'desktop', '2026-04-27T00:05:00.000Z', 0)`
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
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('view_state', 'session_resume:windows:desktop:desktop-test:active_node', 9, 'view-hash',
       'desktop-test', '2026-04-27T00:06:00.000Z', 0)`
  );
}

export function insertNodeAttachmentRows() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-1', 'cover.png', 'image/png', 12, '2026-04-27T00:02:00.000Z']
  );
  driver.execute('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)', ['node-1', 'att-1', 'image']);
}

export function insertExternalFolderSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO external_search_folders (
       id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
       status, document_count, indexed_at, last_error, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['folder-1', '/library', 'document_relative_first_then_fixed_root', null, '[".git"]',
      'ready', 3, '2026-04-27T00:03:00.000Z', null,
      '2026-04-27T00:03:00.000Z', '2026-04-27T00:03:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('external_folder', 'folder-1', 4, 'external-folder-hash',
       'desktop', '2026-04-27T00:03:00.000Z', 1)`
  );
}

export function insertImportSourceSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO document_sources (
       source_id, provider, provider_document_id, source_kind, source_name, source_locator,
       source_fingerprint, content_fingerprint, presentation_state, availability_state, sync_status,
       internal_node_id, internalized_at, title, first_seen_at, last_seen_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['source-1', 'manual', 'source-1', 'markdown', 'notes.md', '/library/notes.md',
      'source-1', 'content-1', 'internal', 'available', 'synced', 'node-1', '2026-04-27T00:04:00.000Z',
      'notes.md', '2026-04-27T00:04:00.000Z', '2026-04-27T00:04:00.000Z',
      '2026-04-27T00:04:00.000Z', '2026-04-27T00:04:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('document_source', 'source-1', 5, 'document-source-hash',
       'desktop', '2026-04-27T00:04:00.000Z', 1)`
  );
}

export function insertPdfPageTextSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['pdf-1', 'paper.pdf', 'application/pdf', 128, '2026-04-27T00:05:00.000Z']
  );
  driver.execute(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
     VALUES (?, ?, ?, ?, ?)`,
    ['pdf-1', 1, 'page text', 612, 792]
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('pdf_page_text', 'pdf-1:1', 7, 'pdf-page-text-hash',
       'desktop', '2026-04-27T00:05:00.000Z', 1)`
  );
}

export function readPackRows(packPath: string) {
  return readPackRowsFromZip(packPath, tempRoot);
}
