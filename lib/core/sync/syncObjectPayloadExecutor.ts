import { hasCanonicalExternalResourceContentHash } from './canonicalExternalResourceContentHash.js';
import type { DbPort } from './dbPort.js';
import { applyNodeMemberPosition } from './nodeVersionMemberPositionApply.js';
import { applyForegroundDailyTime } from './syncForegroundDailyTime.js';
import { applyExternalFolderObject } from './syncObjectExternalFolderPayloadExecutor.js';
import { applyImportSourceObject } from './syncObjectImportSourcePayloadExecutor.js';
import {
  applyNodeReadingObject,
  applyNodeReviewObject,
  type SyncObjectPayloadApplyOptions
} from './syncObjectLearningPayloadExecutor.js';
import { applyNodeOpenStateObject } from './syncObjectOpenStatePayloadExecutor.js';
import { applyParentChildOrderObject } from './syncObjectParentChildOrderPayload.js';
import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';
import { applySettingObject, applyViewStateObject } from './syncObjectPrivateStatePayloadExecutor.js';
import { applyWatchedFolderObject } from './syncObjectWatchedFolderPayloadExecutor.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';
import { applyTopicDailyCount } from './syncTopicDailyCount.js';

export async function applySyncObjectPayloadWithDbPort(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions = {}
) {
  switch (record.object_type) {
    case 'foreground_daily_time':
      return applyForegroundDailyTime(port, record);
    case 'topic_daily_count':
      return applyTopicDailyCount(port, record);
    case 'external_document':
      return applyExternalDocumentObject(port, record);
    case 'external_folder':
      return applyExternalFolderObject(port, record);
    case 'import_source':
      return applyImportSourceObject(port, record);
    case 'node_open_state':
      return applyNodeOpenStateObject(port, record);
    case 'parent_child_order':
      return applyParentChildOrderObject(port, record);
    case 'node_position':
      return applyNodeMemberPosition(port, record);
    case 'order_version':
      return applyParentOrderFactObject(port, record);
    case 'node_reading':
      return applyNodeReadingObject(port, record, options);
    case 'node_review':
      return applyNodeReviewObject(port, record);
    case 'node_text_alternative':
      return applyNodeTextAlternativeObject(port, record);
    case 'pdf_page_text':
      return applyPdfPageTextObject(port, record);
    case 'setting':
      return applySettingObject(port, record, options);
    case 'watched_folder':
      return applyWatchedFolderObject(port, record);
    case 'view_state':
      return applyViewStateObject(port, record, options);
    default:
      throw new Error(`Unsupported sync object type: ${String(record.object_type)}`);
  }
}

async function applyNodeTextAlternativeObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_text_alternatives WHERE alternative_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const nodeId = text(payload.node_id) ?? '';
  const sourceHostName = text(payload.source_host_name) ?? '';
  const status = text(payload.status) ?? 'available';
  if (status === 'available') {
    await port.run(
      `UPDATE node_text_alternatives SET status = 'superseded', updated_at = ?
       WHERE node_id = ? AND source_host_name = ? AND status = 'available' AND alternative_id <> ?`,
      [record.updated_at, nodeId, sourceHostName, record.object_id]
    );
  }
  await port.run(
    `INSERT INTO node_text_alternatives (
       alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(alternative_id) DO UPDATE SET
       status = excluded.status, updated_at = excluded.updated_at
     WHERE node_text_alternatives.status = 'available'
       OR node_text_alternatives.status = excluded.status`,
    [record.object_id, nodeId, text(payload.source_version_id) ?? '',
      text(payload.body_text) ?? '', sourceHostName,
      text(payload.created_at) ?? record.updated_at, status, record.updated_at]
  );
}

async function applyExternalDocumentObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (!hasCanonicalExternalResourceContentHash(record)) {
    throw new Error('sync_content_hash_mismatch:external_document');
  }
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
    `content_hash, title, opening_text, body_blob_hash, content, indexed_at, is_present, reference_kind, reference_json, ` +
    `missing_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(document_id) DO UPDATE SET folder_id = excluded.folder_id, relative_path = excluded.relative_path, ` +
    `file_name = excluded.file_name, extension = excluded.extension, source_size_bytes = excluded.source_size_bytes, ` +
    `content_hash = excluded.content_hash, title = excluded.title, body_blob_hash = excluded.body_blob_hash, ` +
    `is_present = 1, reference_kind = excluded.reference_kind, reference_json = excluded.reference_json, ` +
    `missing_at = NULL, updated_at = excluded.updated_at`,
    [record.object_id, text(payload.folder_id) ?? '', text(payload.relative_path) ?? '', text(payload.file_name) ?? '',
      text(payload.extension) ?? '', integer(payload.source_size_bytes), text(payload.source_modified_at) ?? record.updated_at,
      integer(payload.source_modified_ms), text(payload.content_hash) ?? record.content_hash, text(payload.title) ?? '',
      text(payload.opening_text), text(payload.body_blob_hash), text(payload.content) ?? '',
      text(payload.indexed_at) ?? record.updated_at, 1,
      text(payload.reference_kind) ?? 'local_path', text(payload.reference_json), text(payload.missing_at),
      text(payload.created_at) ?? record.updated_at, record.updated_at]
  );
}

async function applyPdfPageTextObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const payload = asObject(record);
  const attachmentId = text(payload.attachment_id) ?? record.object_id.split(':')[0] ?? record.object_id;
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
