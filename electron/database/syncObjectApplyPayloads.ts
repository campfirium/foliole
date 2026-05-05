import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { asObject, integer, numberOrNull, text, type JsonObject } from '../../lib/core/sync/syncObjectPayloadValues.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { applyViewState } from './syncObjectApplyViewState.js';

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
       source_modified_ms, content_hash, title, opening_text, body_blob_hash, content, indexed_at, is_present, missing_at,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(document_id) DO UPDATE SET
       folder_id = excluded.folder_id, relative_path = excluded.relative_path, file_name = excluded.file_name,
       extension = excluded.extension, source_size_bytes = excluded.source_size_bytes,
       source_modified_at = excluded.source_modified_at, source_modified_ms = excluded.source_modified_ms,
       content_hash = excluded.content_hash, title = excluded.title, opening_text = excluded.opening_text,
       body_blob_hash = excluded.body_blob_hash, content = excluded.content, indexed_at = excluded.indexed_at, is_present = excluded.is_present,
       missing_at = excluded.missing_at, updated_at = excluded.updated_at`,
    [record.object_id, text(payload.folder_id) ?? '',
      text(payload.relative_path) ?? '', text(payload.file_name) ?? '',
      text(payload.extension) ?? '', integer(payload.source_size_bytes),
      text(payload.source_modified_at) ?? record.updated_at,
      integer(payload.source_modified_ms),
      text(payload.content_hash) ?? record.content_hash, text(payload.title) ?? '',
      text(payload.opening_text), text(payload.body_blob_hash), text(payload.content) ?? '',
      text(payload.indexed_at) ?? record.updated_at,
      integer(payload.is_present) === 0 ? 0 : 1,
      text(payload.missing_at), text(payload.created_at) ?? record.updated_at,
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
    [record.object_id, text(payload.folder_path) ?? '',
      text(payload.attachment_mode) ?? 'document_relative_first_then_fixed_root',
      text(payload.attachment_root_path),
      text(payload.excluded_dirs_json) ?? '[]',
      text(payload.status) ?? 'idle', integer(payload.document_count),
      text(payload.indexed_at), text(payload.last_error),
      text(payload.created_at) ?? record.updated_at, record.updated_at]
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
    [record.object_id, text(payload.provider) ?? 'unknown', text(payload.source_kind) ?? 'unknown',
      text(payload.source_name) ?? record.object_id,
      text(payload.source_locator) ?? record.object_id,
      text(payload.first_imported_at) ?? record.updated_at,
      text(payload.last_imported_at) ?? record.updated_at,
      text(payload.last_content_fingerprint) ?? record.content_hash,
      text(payload.latest_node_id)]
  );
}

function applyNodeReading(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  if (record.deleted_at) {
    driver.execute('DELETE FROM node_reading WHERE node_id = ?', [record.object_id]);
    driver.execute('DELETE FROM node_reading_device_state WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  driver.execute(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at,
       priority, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       interval_duration_ms = excluded.interval_duration_ms, interval_growth_factor = excluded.interval_growth_factor,
       last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, priority = excluded.priority,
       repetition_count = excluded.repetition_count, state = excluded.state`,
    [record.object_id, integer(payload.interval_duration_ms), numberOrNull(payload.interval_growth_factor) ?? 1,
      text(payload.last_handled_at) ?? record.updated_at,
      text(payload.next_at) ?? record.updated_at,
      numberOrNull(payload.priority) ?? 0,
      integer(payload.repetition_count),
      text(payload.state) ?? 'active']
  );
  if ('reading_position' in payload) {
    const deviceId = text(payload.device_id) ?? '*';
    driver.execute(
      `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(node_id, device_id) DO UPDATE SET
         reading_position = excluded.reading_position,
         updated_at = excluded.updated_at`,
      [record.object_id, deviceId, integer(payload.reading_position), record.updated_at]
    );
  }
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
    [record.object_id, text(payload.due) ?? record.updated_at, text(payload.last_review_at),
      integer(payload.state), numberOrNull(payload.stability) ?? 0, numberOrNull(payload.difficulty) ?? 0,
      integer(payload.elapsed_days),
      integer(payload.scheduled_days), integer(payload.reps), integer(payload.lapses)]
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

export function applySyncObjectPayload(driver: DatabaseDriver, record: NativeSyncObjectRecord) {
  switch (record.object_type) {
    case 'attachment':
      return applyAttachment(driver, record);
    case 'external_document':
      return applyExternalDocument(driver, record);
    case 'external_folder':
      return applyExternalFolder(driver, record);
    case 'import_source':
      return applyImportSource(driver, record);
    case 'node_reading':
      return applyNodeReading(driver, record);
    case 'node_review':
      return applyNodeReview(driver, record);
    case 'pdf_page_text':
      return applyPdfPageText(driver, record);
    case 'setting':
      return applySetting(driver, record);
    case 'view_state':
      return applyViewState(driver, record);
    default:
      throw new Error(`Unsupported sync object type: ${String((record as { object_type?: unknown }).object_type)}`);
  }
}
