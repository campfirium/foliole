import type { DbPort } from './dbPort.js';
import { asObject, integer, numberOrNull, text, type JsonObject } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applySyncObjectPayloadWithDbPort(port: DbPort, record: SyncPackSyncObjectRecord) {
  switch (record.object_type) {
    case 'attachment':
      return applyAttachmentObject(port, record);
    case 'external_document':
      return applyExternalDocumentObject(port, record);
    case 'external_folder':
      return applyExternalFolderObject(port, record);
    case 'import_source':
      return applyImportSourceObject(port, record);
    case 'node_reading':
      return applyNodeReadingObject(port, record);
    case 'node_review':
      return applyNodeReviewObject(port, record);
    case 'pdf_page_text':
      return applyPdfPageTextObject(port, record);
    case 'setting':
      return applySettingObject(port, record);
    case 'view_state':
      return applyViewStateObject(port, record);
    default:
      throw new Error(`Unsupported sync object type: ${String(record.object_type)}`);
  }
}

async function applyExternalDocumentObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const payload = asObject(record);
  if (record.deleted_at) {
    await port.run('UPDATE external_documents SET is_present = 0, missing_at = ?, updated_at = ? WHERE document_id = ?', [
      record.deleted_at, record.updated_at, record.object_id
    ]);
    return;
  }
  await port.run(
    `INSERT INTO external_documents (` +
    `document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at, source_modified_ms, ` +
    `content_hash, title, opening_text, body_blob_hash, content, indexed_at, is_present, missing_at, created_at, updated_at` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(document_id) DO UPDATE SET folder_id = excluded.folder_id, relative_path = excluded.relative_path, ` +
    `file_name = excluded.file_name, extension = excluded.extension, source_size_bytes = excluded.source_size_bytes, ` +
    `source_modified_at = excluded.source_modified_at, source_modified_ms = excluded.source_modified_ms, ` +
    `content_hash = excluded.content_hash, title = excluded.title, opening_text = excluded.opening_text, ` +
    `body_blob_hash = excluded.body_blob_hash, content = excluded.content, indexed_at = excluded.indexed_at, ` +
    `is_present = excluded.is_present, missing_at = excluded.missing_at, updated_at = excluded.updated_at`,
    [record.object_id, text(payload.folder_id) ?? '', text(payload.relative_path) ?? '', text(payload.file_name) ?? '',
      text(payload.extension) ?? '', integer(payload.source_size_bytes), text(payload.source_modified_at) ?? record.updated_at,
      integer(payload.source_modified_ms), text(payload.content_hash) ?? record.content_hash, text(payload.title) ?? '',
      text(payload.opening_text), text(payload.body_blob_hash), text(payload.content) ?? '',
      text(payload.indexed_at) ?? record.updated_at, integer(payload.is_present) === 0 ? 0 : 1, text(payload.missing_at),
      text(payload.created_at) ?? record.updated_at, record.updated_at]
  );
}

async function applySettingObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const parts = record.object_id.split(':', 5);
  if (record.deleted_at) {
    await port.run(
      `DELETE FROM setting_records WHERE scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?`,
      [parts[0] ?? 'device', parts[1] ?? '*', parts[2] ?? '*', parts[3] ?? '*', parts[4] ?? record.object_id]
    );
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO setting_records (scope, platform, form_factor, device_id, key, value_json, content_hash, updated_at, deleted_at) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(key, scope, platform, form_factor, device_id) DO UPDATE SET ` +
    `value_json = excluded.value_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [text(payload.scope) ?? parts[0] ?? 'device', text(payload.platform) ?? parts[1] ?? '*',
      text(payload.form_factor) ?? parts[2] ?? '*', text(payload.device_id) ?? parts[3] ?? '*',
      text(payload.key) ?? parts[4] ?? record.object_id, text(payload.value_json) ?? 'null',
      record.content_hash, record.updated_at, null]
  );
}

async function applyExternalFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM external_search_folders WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status, ` +
    `document_count, indexed_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(id) DO UPDATE SET folder_path = excluded.folder_path, attachment_mode = excluded.attachment_mode, ` +
    `attachment_root_path = excluded.attachment_root_path, excluded_dirs_json = excluded.excluded_dirs_json, ` +
    `status = excluded.status, document_count = excluded.document_count, indexed_at = excluded.indexed_at, ` +
    `last_error = excluded.last_error, updated_at = excluded.updated_at`,
    [record.object_id, text(payload.folder_path) ?? '', text(payload.attachment_mode) ?? 'document_relative_first_then_fixed_root',
      text(payload.attachment_root_path), text(payload.excluded_dirs_json) ?? '[]', text(payload.status) ?? 'idle',
      integer(payload.document_count), text(payload.indexed_at), text(payload.last_error),
      text(payload.created_at) ?? record.updated_at, record.updated_at]
  );
}

async function applyImportSourceObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM import_sources WHERE source_fingerprint = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name, source_locator, ` +
    `first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(source_fingerprint) DO UPDATE SET provider = excluded.provider, source_kind = excluded.source_kind, ` +
    `source_name = excluded.source_name, source_locator = excluded.source_locator, last_imported_at = excluded.last_imported_at, ` +
    `last_content_fingerprint = excluded.last_content_fingerprint, latest_node_id = excluded.latest_node_id`,
    [record.object_id, text(payload.provider) ?? 'unknown', text(payload.source_kind) ?? 'unknown',
      text(payload.source_name) ?? record.object_id, text(payload.source_locator) ?? record.object_id,
      text(payload.first_imported_at) ?? record.updated_at, text(payload.last_imported_at) ?? record.updated_at,
      text(payload.last_content_fingerprint) ?? record.content_hash, text(payload.latest_node_id)]
  );
}

async function applyNodeReadingObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_reading WHERE node_id = ?', [record.object_id]);
    await port.run('DELETE FROM node_reading_device_state WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO node_reading (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET interval_duration_ms = excluded.interval_duration_ms, ` +
    `interval_growth_factor = excluded.interval_growth_factor, last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, ` +
    `priority = excluded.priority, repetition_count = excluded.repetition_count, state = excluded.state`,
    [record.object_id, integer(payload.interval_duration_ms), numberOrNull(payload.interval_growth_factor) ?? 1,
      text(payload.last_handled_at) ?? record.updated_at, text(payload.next_at) ?? record.updated_at,
      numberOrNull(payload.priority) ?? 0, integer(payload.repetition_count), text(payload.state) ?? 'active']
  );
  if ('reading_position' in payload) {
    await port.run(
      `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at) VALUES (?, ?, ?, ?) ` +
      `ON CONFLICT(node_id, device_id) DO UPDATE SET reading_position = excluded.reading_position, updated_at = excluded.updated_at`,
      [record.object_id, text(payload.device_id) ?? '*', integer(payload.reading_position), record.updated_at]
    );
  }
}

async function applyNodeReviewObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_review WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO node_review (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET due = excluded.due, ` +
    `last_review_at = excluded.last_review_at, state = excluded.state, stability = excluded.stability, ` +
    `difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days, ` +
    `reps = excluded.reps, lapses = excluded.lapses`,
    [record.object_id, text(payload.due) ?? record.updated_at, text(payload.last_review_at), integer(payload.state),
      numberOrNull(payload.stability) ?? 0, numberOrNull(payload.difficulty) ?? 0, integer(payload.elapsed_days),
      integer(payload.scheduled_days), integer(payload.reps), integer(payload.lapses)]
  );
}

async function applyPdfPageTextObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const payload = asObject(record);
  const attachmentId = text(payload.attachment_id) ?? record.object_id.split(':')[0];
  const page = numberOrNull(payload.page) ?? Number(record.object_id.split(':').at(-1));
  if (record.deleted_at) {
    await port.run('DELETE FROM pdf_page_text WHERE attachment_id = ? AND page = ?', [attachmentId, page]);
    return;
  }
  await port.run(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) VALUES (?, ?, ?, ?, ?) ` +
    `ON CONFLICT(attachment_id, page) DO UPDATE SET text = excluded.text, page_width = excluded.page_width, page_height = excluded.page_height`,
    [attachmentId, page, text(payload.text) ?? '', numberOrNull(payload.page_width), numberOrNull(payload.page_height)]
  );
}

async function applyAttachmentObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM pdf_page_text WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM attachment_blobs WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM attachments WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const blob = payload.blob && typeof payload.blob === 'object' ? payload.blob as JsonObject : {};
  await port.run(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?) ` +
    `ON CONFLICT(id) DO UPDATE SET original_name = excluded.original_name, mime_type = excluded.mime_type, size_bytes = excluded.size_bytes`,
    [record.object_id, text(payload.original_name), text(payload.mime_type), numberOrNull(payload.size_bytes), text(payload.created_at) ?? record.updated_at]
  );
  await port.run(
    `INSERT INTO attachment_blobs (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, ` +
    `source_device_id, created_at, cached_at, last_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(attachment_id) DO UPDATE SET content_hash = excluded.content_hash, storage_key = excluded.storage_key, ` +
    `size_bytes = excluded.size_bytes, mime_type = excluded.mime_type, availability = excluded.availability, ` +
    `source_device_id = excluded.source_device_id, cached_at = excluded.cached_at, last_verified_at = excluded.last_verified_at`,
    [record.object_id, text(blob.content_hash), text(blob.storage_key), numberOrNull(blob.size_bytes), text(blob.mime_type),
      normalizeAttachmentAvailability(blob), text(blob.source_device_id), text(blob.created_at) ?? record.updated_at,
      text(blob.cached_at), text(blob.last_verified_at)]
  );
}

function normalizeAttachmentAvailability(blob: JsonObject) {
  const availability = text(blob.availability) ?? 'remote_known';
  return availability === 'local' ? 'remote_known' : availability;
}

async function applyViewStateObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const parts = record.object_id.split(':');
  const deviceId = parts.length >= 5 ? parts[3] : '*';
  const key = parts.length >= 5 ? parts.slice(4).join(':') : record.object_id;
  if (record.deleted_at) {
    if (key === 'active_node') await port.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    if (key.startsWith('node:')) await port.run('DELETE FROM node_view_state WHERE node_id = ? AND device_id = ?', [key.slice(5), deviceId]);
    return;
  }
  const payload = asObject(record);
  if (key === 'active_node') {
    await port.run(
      `INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?) ` +
      `ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [text(payload.active_node_id) ?? '', record.updated_at]
    );
  } else if (key.startsWith('node:')) {
    await port.run(
      `INSERT INTO node_view_state (node_id, device_id, scroll_top, selection_from, selection_to, source, updated_at) ` +
      `VALUES (?, ?, ?, NULL, NULL, ?, ?) ON CONFLICT(node_id, device_id) DO UPDATE SET scroll_top = excluded.scroll_top, ` +
      `selection_from = excluded.selection_from, selection_to = excluded.selection_to, source = excluded.source, updated_at = excluded.updated_at`,
      [key.slice(5), deviceId, Math.max(0, integer(payload.scroll_top)), Object.hasOwn(payload, 'source') ? 'sync-apply' : 'user-scroll', record.updated_at]
    );
  }
}
