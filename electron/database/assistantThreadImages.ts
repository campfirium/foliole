import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeAssistantProviderId } from '../../lib/platform/nativeAssistantContract.js';
import type {
  NativeAssistantImageAttachment,
  NativeAssistantImageMimeType
} from '../../lib/platform/nativeAssistantImageContract.js';

import { openAssistantHistoryConnection } from './assistantHistoryConnection.js';

interface AssistantImageRow extends DatabaseRow {
  attachment_id: string;
  created_at: string;
  mime_type: NativeAssistantImageMimeType;
  original_name: string;
  size_bytes: number;
}

interface AssistantMessageImageRow extends AssistantImageRow {
  message_id: string;
  position: number;
}

export function upsertAssistantImageAttachments(images: NativeAssistantImageAttachment[]) {
  const driver = openAssistantHistoryConnection().driver;
  const createdAt = new Date().toISOString();
  for (const image of images) {
    driver.execute(
      `INSERT INTO assistant_image_attachments (
        attachment_id, mime_type, original_name, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(attachment_id) DO UPDATE SET
        original_name = excluded.original_name`,
      [image.id, image.mimeType, image.originalName, image.sizeBytes, createdAt]
    );
  }
}

export function replaceAssistantMessageImages(input: {
  images: NativeAssistantImageAttachment[];
  messageId: string;
  provider: NativeAssistantProviderId;
  providerThreadId: string;
}) {
  const provider = input.provider;
  const driver = openAssistantHistoryConnection().driver;
  driver.execute(
    `DELETE FROM assistant_thread_message_images
     WHERE provider = ? AND provider_thread_id = ? AND message_id = ?`,
    [provider, input.providerThreadId, input.messageId]
  );
  upsertAssistantImageAttachments(input.images);
  input.images.forEach((image, position) => driver.execute(
    `INSERT INTO assistant_thread_message_images (
      provider, provider_thread_id, message_id, position, attachment_id
    ) VALUES (?, ?, ?, ?, ?)`,
    [provider, input.providerThreadId, input.messageId, position, image.id]
  ));
}

export function listAssistantThreadMessageImages(
  provider: NativeAssistantProviderId,
  providerThreadId: string
) {
  const rows = openAssistantHistoryConnection().driver.queryAll<AssistantMessageImageRow>(
    `SELECT links.message_id, links.position, images.*
     FROM assistant_thread_message_images links
     JOIN assistant_image_attachments images
       ON images.attachment_id = links.attachment_id
     WHERE links.provider = ? AND links.provider_thread_id = ?
     ORDER BY links.message_id ASC, links.position ASC`,
    [provider, providerThreadId]
  );
  const imagesByMessage = new Map<string, NativeAssistantImageAttachment[]>();
  for (const row of rows) {
    const images = imagesByMessage.get(row.message_id) ?? [];
    images.push(imageRowToAttachment(row));
    imagesByMessage.set(row.message_id, images);
  }
  return imagesByMessage;
}

export function getAssistantImageAttachment(attachmentId: string) {
  const row = openAssistantHistoryConnection().driver.queryOne<AssistantImageRow>(
    'SELECT * FROM assistant_image_attachments WHERE attachment_id = ?',
    [attachmentId]
  );
  return row ? imageRowToAttachment(row) : null;
}

export function listAssistantThreadAttachmentIds(
  provider: NativeAssistantProviderId,
  providerThreadId: string
) {
  return openAssistantHistoryConnection().driver.queryAll<{ attachment_id: string }>(
    `SELECT DISTINCT attachment_id FROM assistant_thread_message_images
     WHERE provider = ? AND provider_thread_id = ?`,
    [provider, providerThreadId]
  ).map((row) => row.attachment_id);
}

export function deleteUnreferencedAssistantImageAttachments(attachmentIds: string[]) {
  const driver = openAssistantHistoryConnection().driver;
  const deleted: NativeAssistantImageAttachment[] = [];
  for (const attachmentId of new Set(attachmentIds)) {
    const referenced = driver.queryOne<{ present: number }>(
      'SELECT 1 AS present FROM assistant_thread_message_images WHERE attachment_id = ? LIMIT 1',
      [attachmentId]
    );
    if (referenced) continue;
    const image = getAssistantImageAttachment(attachmentId);
    if (!image) continue;
    driver.execute('DELETE FROM assistant_image_attachments WHERE attachment_id = ?', [attachmentId]);
    deleted.push(image);
  }
  return deleted;
}

function imageRowToAttachment(row: AssistantImageRow): NativeAssistantImageAttachment {
  return {
    id: row.attachment_id,
    mimeType: row.mime_type,
    originalName: row.original_name,
    sizeBytes: row.size_bytes
  };
}
