import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { asObject, integer, numberOrNull, text, type JsonObject } from './syncObjectPayloadValues.js';

function applySetting(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  driver.execute(
    `INSERT INTO setting_records (key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, scope, platform, form_factor, device_id) DO UPDATE SET
       value_json = excluded.value_json,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [text(payload.key) ?? record.object_id, text(payload.scope) ?? 'device', text(payload.platform) ?? '*',
      text(payload.form_factor) ?? '*', text(payload.device_id) ?? '*', text(payload.value_json) ?? 'null',
      record.content_hash, record.updated_at, record.deleted_at]
  );
}

function applyExternalDocument(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  if (record.deleted_at) {
    driver.execute('UPDATE external_documents SET is_present = 0, missing_at = ?, updated_at = ? WHERE document_id = ?', [
      record.deleted_at, record.updated_at, record.object_id
    ]);
    return;
  }
  driver.execute(
    `INSERT INTO external_documents (
       document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
       source_modified_ms, content_hash, title, opening_text, content, indexed_at, is_present, missing_at,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(document_id) DO UPDATE SET
       folder_id = excluded.folder_id, relative_path = excluded.relative_path, file_name = excluded.file_name,
       extension = excluded.extension, source_size_bytes = excluded.source_size_bytes,
       source_modified_at = excluded.source_modified_at, source_modified_ms = excluded.source_modified_ms,
       content_hash = excluded.content_hash, title = excluded.title, opening_text = excluded.opening_text,
       content = excluded.content, indexed_at = excluded.indexed_at, is_present = excluded.is_present,
       missing_at = excluded.missing_at, updated_at = excluded.updated_at`,
    [record.object_id, text(payload.folder_id) ?? text(payload.folderId) ?? '',
      text(payload.relative_path) ?? text(payload.relativePath) ?? '', text(payload.file_name) ?? text(payload.fileName) ?? '',
      text(payload.extension) ?? '', integer(payload.source_size_bytes ?? payload.sourceSizeBytes),
      text(payload.source_modified_at) ?? text(payload.sourceModifiedAt) ?? record.updated_at,
      integer(payload.source_modified_ms ?? payload.sourceModifiedMs),
      text(payload.content_hash) ?? text(payload.contentHash) ?? record.content_hash, text(payload.title) ?? '',
      text(payload.opening_text) ?? text(payload.openingText), text(payload.content) ?? '',
      text(payload.indexed_at) ?? text(payload.indexedAt) ?? record.updated_at,
      integer(payload.is_present ?? payload.isPresent) === 0 ? 0 : 1,
      text(payload.missing_at) ?? text(payload.missingAt), text(payload.created_at) ?? text(payload.createdAt) ?? record.updated_at,
      record.updated_at]
  );
}

function applyExternalFolder(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  if (record.deleted_at) {
    driver.execute('DELETE FROM external_search_folders WHERE id = ?', [record.object_id]);
    return;
  }
  driver.execute(
    `INSERT INTO external_search_folders (
       id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
       document_count, indexed_at, last_error, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       folder_path = excluded.folder_path, attachment_mode = excluded.attachment_mode,
       attachment_root_path = excluded.attachment_root_path, excluded_dirs_json = excluded.excluded_dirs_json,
       status = excluded.status, document_count = excluded.document_count, indexed_at = excluded.indexed_at,
       last_error = excluded.last_error, updated_at = excluded.updated_at`,
    [record.object_id, text(payload.folder_path) ?? text(payload.folderPath) ?? '',
      text(payload.attachment_mode) ?? text(payload.attachmentMode) ?? 'document_relative_first_then_fixed_root',
      text(payload.attachment_root_path) ?? text(payload.attachmentRootPath),
      text(payload.excluded_dirs_json) ?? JSON.stringify(payload.excludedDirs ?? []),
      text(payload.status) ?? 'idle', integer(payload.document_count ?? payload.documentCount),
      text(payload.indexed_at) ?? text(payload.indexedAt), text(payload.last_error) ?? text(payload.lastError),
      text(payload.created_at) ?? text(payload.createdAt) ?? record.updated_at, record.updated_at]
  );
}

function applyImportSource(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  if (record.deleted_at) {
    driver.execute('DELETE FROM import_sources WHERE source_fingerprint = ?', [record.object_id]);
    return;
  }
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_fingerprint) DO UPDATE SET
       provider = excluded.provider, source_kind = excluded.source_kind, source_name = excluded.source_name,
       source_locator = excluded.source_locator, last_imported_at = excluded.last_imported_at,
       last_content_fingerprint = excluded.last_content_fingerprint, latest_node_id = excluded.latest_node_id`,
    [record.object_id, text(payload.provider) ?? 'unknown', text(payload.source_kind) ?? text(payload.sourceKind) ?? 'unknown',
      text(payload.source_name) ?? text(payload.sourceName) ?? record.object_id,
      text(payload.source_locator) ?? text(payload.sourceLocator) ?? record.object_id,
      text(payload.first_imported_at) ?? text(payload.firstImportedAt) ?? record.updated_at,
      text(payload.last_imported_at) ?? text(payload.lastImportedAt) ?? record.updated_at,
      text(payload.last_content_fingerprint) ?? text(payload.lastContentFingerprint) ?? record.content_hash,
      text(payload.latest_node_id) ?? text(payload.latestNodeId)]
  );
}

function applyNodeReading(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  if (record.deleted_at) {
    driver.execute('DELETE FROM node_reading WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  driver.execute(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at,
       priority, reading_position, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       interval_duration_ms = excluded.interval_duration_ms, interval_growth_factor = excluded.interval_growth_factor,
       last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, priority = excluded.priority,
       reading_position = excluded.reading_position, repetition_count = excluded.repetition_count, state = excluded.state`,
    [record.object_id, integer(payload.interval_duration_ms), numberOrNull(payload.interval_growth_factor) ?? 1,
      text(payload.last_handled_at) ?? text(payload.lastHandledAt) ?? record.updated_at,
      text(payload.next_at) ?? text(payload.nextAt) ?? record.updated_at,
      numberOrNull(payload.priority) ?? 0, integer(payload.reading_position ?? payload.readingPosition),
      integer(payload.repetition_count ?? payload.repetitionCount),
      text(payload.state) ?? 'active']
  );
}

function applyNodeReview(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  if (record.deleted_at) {
    driver.execute('DELETE FROM node_review WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  driver.execute(
    `INSERT INTO node_review (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       due = excluded.due, last_review_at = excluded.last_review_at, state = excluded.state,
       stability = excluded.stability, difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days, reps = excluded.reps, lapses = excluded.lapses`,
    [record.object_id, text(payload.due) ?? record.updated_at, text(payload.last_review_at) ?? text(payload.lastReviewAt),
      integer(payload.state), numberOrNull(payload.stability) ?? 0, numberOrNull(payload.difficulty) ?? 0,
      integer(payload.elapsed_days ?? payload.elapsedDays),
      integer(payload.scheduled_days ?? payload.scheduledDays), integer(payload.reps), integer(payload.lapses)]
  );
}

function applyPdfPageText(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  const attachmentId = text(payload.attachment_id) ?? record.object_id.split(':')[0];
  const page = numberOrNull(payload.page) ?? Number(record.object_id.split(':').at(-1));
  if (record.deleted_at) {
    driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ? AND page = ?', [attachmentId, page]);
    return;
  }
  driver.execute(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(attachment_id, page) DO UPDATE SET text = excluded.text,
       page_width = excluded.page_width, page_height = excluded.page_height`,
    [attachmentId, page, text(payload.text) ?? '', numberOrNull(payload.page_width), numberOrNull(payload.page_height)]
  );
}

function applyAttachment(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  const blob = payload.blob && typeof payload.blob === 'object' ? payload.blob as JsonObject : {};
  if (record.deleted_at) {
    driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ?', [record.object_id]);
    driver.execute('DELETE FROM attachment_blobs WHERE attachment_id = ?', [record.object_id]);
    driver.execute('DELETE FROM attachments WHERE id = ?', [record.object_id]);
    return;
  }
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET original_name = excluded.original_name,
       mime_type = excluded.mime_type, size_bytes = excluded.size_bytes`,
    [record.object_id, text(payload.original_name), text(payload.mime_type), numberOrNull(payload.size_bytes),
      text(payload.created_at) ?? record.updated_at]
  );
  driver.execute(
    `INSERT INTO attachment_blobs (
       attachment_id, content_hash, storage_key, size_bytes, mime_type, availability,
       source_device_id, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(attachment_id) DO UPDATE SET content_hash = excluded.content_hash,
       storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, mime_type = excluded.mime_type,
       availability = excluded.availability, source_device_id = excluded.source_device_id,
       cached_at = excluded.cached_at, last_verified_at = excluded.last_verified_at`,
    [record.object_id, text(blob.content_hash), text(blob.storage_key), numberOrNull(blob.size_bytes),
      text(blob.mime_type), text(blob.availability) ?? 'missing', text(blob.source_device_id),
      text(blob.created_at) ?? record.updated_at, text(blob.cached_at), text(blob.last_verified_at)]
  );
}

function applyViewState(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  const payload = asObject(record);
  const key = record.object_id.split(':').slice(4).join(':');
  if (record.deleted_at) {
    if (key === 'active_node') driver.execute("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    if (key.startsWith('node:')) driver.execute('DELETE FROM node_view_state WHERE node_id = ?', [key.slice(5)]);
    return;
  }
  if (key === 'active_node') {
    driver.execute(
      `INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [text(payload.active_node_id) ?? text(payload.activeNodeId) ?? '', record.updated_at]
    );
    return;
  }
  if (key.startsWith('node:')) {
    driver.execute(
      `INSERT INTO node_view_state (node_id, scroll_top, selection_from, selection_to, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET scroll_top = excluded.scroll_top,
         selection_from = excluded.selection_from, selection_to = excluded.selection_to, updated_at = excluded.updated_at`,
      [key.slice(5), integer(payload.scroll_top ?? payload.scrollTop),
        numberOrNull(payload.selection_from ?? payload.selectionFrom), numberOrNull(payload.selection_to ?? payload.selectionTo),
        record.updated_at]
    );
  }
}

export function applySyncObjectPayload(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  if (record.object_type === 'attachment') applyAttachment(driver, record);
  if (record.object_type === 'external_document') applyExternalDocument(driver, record);
  if (record.object_type === 'external_folder') applyExternalFolder(driver, record);
  if (record.object_type === 'import_source') applyImportSource(driver, record);
  if (record.object_type === 'node_reading') applyNodeReading(driver, record);
  if (record.object_type === 'node_review') applyNodeReview(driver, record);
  if (record.object_type === 'pdf_page_text') applyPdfPageText(driver, record);
  if (record.object_type === 'setting') applySetting(driver, record);
  if (record.object_type === 'view_state') applyViewState(driver, record);
}
