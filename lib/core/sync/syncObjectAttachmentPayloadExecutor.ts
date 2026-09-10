import type { DbPort } from './dbPort.js';
import { asObject, numberOrNull, text, type JsonObject } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyAttachmentObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM pdf_page_text WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM attachment_blobs WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM node_attachments WHERE attachment_id = ?', [record.object_id]);
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
    `source_host_name, created_at, cached_at, last_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(attachment_id) DO UPDATE SET content_hash = excluded.content_hash, storage_key = excluded.storage_key, ` +
    `size_bytes = excluded.size_bytes, mime_type = excluded.mime_type, availability = excluded.availability, ` +
    `source_host_name = excluded.source_host_name, cached_at = excluded.cached_at, last_verified_at = excluded.last_verified_at`,
    [record.object_id, text(blob.content_hash), text(blob.storage_key), numberOrNull(blob.size_bytes), text(blob.mime_type),
      normalizeAttachmentAvailability(blob), text(blob.source_host_name), text(blob.created_at) ?? record.updated_at,
      text(blob.cached_at), text(blob.last_verified_at)]
  );
}

function normalizeAttachmentAvailability(blob: JsonObject) {
  const availability = text(blob.availability) ?? 'remote_known';
  return availability === 'local' ? 'remote_known' : availability;
}
