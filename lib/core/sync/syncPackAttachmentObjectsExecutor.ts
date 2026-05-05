import type { DbPort } from './dbPort.js';
import { asObject, integer, numberOrNull, text, type JsonObject } from './syncObjectPayloadValues.js';
import {
  loadSyncPackSyncObjectsWithDbPort,
  type SyncPackSyncObjectRecord,
  type SyncPackSyncObjectsOptions
} from './syncPackSyncObjectsExecutor.js';

export async function applySyncPackAttachmentObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'attachment' || record.object_type === 'pdf_page_text');
  for (const record of records) {
    if (record.object_type === 'attachment') {
      await applyAttachmentObject(port, record);
    } else {
      await applyPdfPageTextObject(port, record);
    }
  }
  return records.length;
}

async function applyAttachmentObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM pdf_page_text WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM attachment_blobs WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM attachments WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const blob = payload.blob && typeof payload.blob === 'object' ? payload.blob as JsonObject : null;
  await port.run(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) ` +
    `VALUES (?, ?, ?, ?, ?) ` +
    `ON CONFLICT(id) DO UPDATE SET ` +
    `original_name = excluded.original_name, mime_type = excluded.mime_type, size_bytes = excluded.size_bytes`,
    [
      record.object_id,
      text(payload.original_name),
      text(payload.mime_type),
      integer(payload.size_bytes),
      text(payload.created_at) ?? record.updated_at
    ]
  );
  await port.run(
    `INSERT INTO attachment_blobs (` +
    `attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, ` +
    `source_device_id, created_at, cached_at, last_verified_at` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(attachment_id) DO UPDATE SET ` +
    `content_hash = excluded.content_hash, storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, ` +
    `mime_type = excluded.mime_type, availability = excluded.availability, source_device_id = excluded.source_device_id, ` +
    `cached_at = excluded.cached_at, last_verified_at = excluded.last_verified_at`,
    [
      record.object_id,
      blob ? text(blob.content_hash) : null,
      blob ? text(blob.storage_key) : null,
      blob ? integer(blob.size_bytes) : integer(payload.size_bytes),
      blob ? text(blob.mime_type) : text(payload.mime_type),
      normalizeAttachmentAvailability(blob),
      blob ? text(blob.source_device_id) : null,
      blob ? text(blob.created_at) ?? record.updated_at : record.updated_at,
      blob ? text(blob.cached_at) : null,
      blob ? text(blob.last_verified_at) : null
    ]
  );
}

function normalizeAttachmentAvailability(blob: JsonObject | null) {
  const availability = blob ? text(blob.availability) ?? 'remote_known' : 'remote_known';
  return availability === 'local' ? 'remote_known' : availability;
}

async function applyPdfPageTextObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const payload = asObject(record);
  const attachmentId = text(payload.attachment_id) ?? record.object_id.split(':')[0] ?? record.object_id;
  const page = numberOrNull(payload.page) ?? Number(record.object_id.split(':').at(-1) ?? 0);
  if (record.deleted_at) {
    await port.run('DELETE FROM pdf_page_text WHERE attachment_id = ? AND page = ?', [attachmentId, page]);
    return;
  }
  await port.run(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) ` +
    `VALUES (?, ?, ?, ?, ?) ` +
    `ON CONFLICT(attachment_id, page) DO UPDATE SET ` +
    `text = excluded.text, page_width = excluded.page_width, page_height = excluded.page_height`,
    [attachmentId, page, text(payload.text) ?? '', numberOrNull(payload.page_width), numberOrNull(payload.page_height)]
  );
}
