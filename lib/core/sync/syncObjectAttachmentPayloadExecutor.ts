import { buildCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import type { DbPort } from './dbPort.js';
import { asObject, numberOrNull, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyAttachmentObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM pdf_page_text WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM node_attachments WHERE attachment_id = ?', [record.object_id]);
    await port.run('DELETE FROM attachments WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const mimeType = text(payload.mime_type);
  if (!/^[a-f0-9]{64}$/.test(record.object_id) || !mimeType || !buildCanonicalAttachmentStorageKey(record.object_id, mimeType)
      || payload.attachment_id !== record.object_id) {
    throw new Error('attachment sync payload has a non-canonical identity');
  }
  await port.run(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?) ` +
    `ON CONFLICT(id) DO UPDATE SET original_name = excluded.original_name, mime_type = excluded.mime_type, size_bytes = excluded.size_bytes`,
    [record.object_id, text(payload.original_name), mimeType, numberOrNull(payload.size_bytes), text(payload.created_at) ?? record.updated_at]
  );
}
