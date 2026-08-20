import type { DbPort } from './dbPort.js';
import { applyAttachmentObject } from './syncObjectAttachmentPayloadExecutor.js';
import { applyExternalFolderObject } from './syncObjectExternalFolderPayloadExecutor.js';
import { applyImportSourceObject } from './syncObjectImportSourcePayloadExecutor.js';
import {
  applyNodeReadingObject,
  applyNodeReviewObject,
  type SyncObjectPayloadApplyOptions
} from './syncObjectLearningPayloadExecutor.js';
import { applyNodeOpenStateObject } from './syncObjectOpenStatePayloadExecutor.js';
import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';
import { applyWatchedFolderObject } from './syncObjectWatchedFolderPayloadExecutor.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applySyncObjectPayloadWithDbPort(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions = {}
) {
  switch (record.object_type) {
    case 'attachment':
      return applyAttachmentObject(port, record);
    case 'external_document':
      return applyExternalDocumentObject(port, record);
    case 'external_folder':
      return applyExternalFolderObject(port, record);
    case 'import_source':
      return applyImportSourceObject(port, record);
    case 'node_open_state':
      return applyNodeOpenStateObject(port, record);
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
  await port.run(
    `INSERT INTO node_text_alternatives (
       alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(alternative_id) DO UPDATE SET
       status = excluded.status, updated_at = excluded.updated_at
     WHERE node_text_alternatives.status = 'available'
       OR node_text_alternatives.status = excluded.status`,
    [record.object_id, text(payload.node_id) ?? '', text(payload.source_version_id) ?? '',
      text(payload.body_text) ?? '', text(payload.source_host_name) ?? '',
      text(payload.created_at) ?? record.updated_at, text(payload.status) ?? 'available', record.updated_at]
  );
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

async function applySettingObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions
) {
  const parts = record.object_id.split(':', 5);
  if (parts.length !== 5 || parts.some((part) => !part)) throw new Error('invalid_setting_host_scope');
  const [scope, platform, formFactor, hostName, key] = parts as [string, string, string, string, string];
  if (scope !== 'user_space' && (!options.hostName || hostName !== options.hostName)) return false;
  if (record.deleted_at) {
    await port.run(
      `DELETE FROM setting_records WHERE scope = ? AND platform = ? AND form_factor = ? AND host_name = ? AND key = ?`,
      [scope, platform, formFactor, hostName, key]
    );
    return true;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO setting_records (scope, platform, form_factor, host_name, key, value_json, content_hash, updated_at, deleted_at) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET ` +
    `value_json = excluded.value_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [text(payload.scope) ?? scope, text(payload.platform) ?? platform,
      text(payload.form_factor) ?? formFactor, text(payload.host_name) ?? hostName,
      text(payload.key) ?? key, text(payload.value_json) ?? 'null',
      record.content_hash, record.updated_at, null]
  );
  return true;
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

async function applyViewStateObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions
) {
  if (!isLocalAndroidViewStateObject(record.object_id, options.hostName)) return false;
  const parts = record.object_id.split(':');
  if (parts.length < 5 || !parts[3]) throw new Error('invalid_view_state_host_scope');
  const hostName = parts[3];
  const key = parts.slice(4).join(':');
  if (record.deleted_at) {
    if (key === 'active_node') await port.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    if (key.startsWith('node:')) await port.run('DELETE FROM node_view_state WHERE node_id = ? AND host_name = ?', [key.slice(5), hostName]);
    return true;
  }
  const payload = asObject(record);
  if (key === 'active_node') {
    await applyActiveNodeViewStateObject(port, record, text(payload.active_node_id));
  } else if (key.startsWith('node:')) {
    await port.run(
      `INSERT INTO node_view_state (node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at) ` +
      `VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id, host_name) DO UPDATE SET scroll_top = excluded.scroll_top, ` +
      `selection_from = excluded.selection_from, selection_to = excluded.selection_to, source = excluded.source, updated_at = excluded.updated_at`,
      [key.slice(5), hostName, Math.max(0, integer(payload.scroll_top)),
        numberOrNull(payload.selection_from), numberOrNull(payload.selection_to),
        Object.hasOwn(payload, 'source') ? 'sync-apply' : 'user-scroll', record.updated_at]
    );
  }
  return true;
}

async function applyActiveNodeViewStateObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  activeNodeId: string | null
) {
  if (!activeNodeId) {
    await port.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    return;
  }
  const [node] = await port.query<{ id: string }>(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL',
    [activeNodeId]
  );
  if (!node) return;
  await port.run(
    `INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?) ` +
    `ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [activeNodeId, record.updated_at]
  );
}

function isLocalAndroidViewStateObject(objectId: string, hostName?: string) {
  if (!hostName) return false;
  const parts = objectId.split(':');
  return parts.length >= 5 && parts[1] === 'android' && parts[3] === hostName;
}
