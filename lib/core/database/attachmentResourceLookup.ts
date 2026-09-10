import type { DatabaseDriver } from './driver.js';

interface AttachmentStorageKeyRow {
  [column: string]: unknown;
  attachment_id: string;
}

export function resolveAttachmentIdFromDriver(driver: DatabaseDriver, storageKey: string) {
  return driver.queryOne<AttachmentStorageKeyRow>(
    'SELECT attachment_id FROM attachment_blobs WHERE storage_key = ?',
    [storageKey]
  )?.attachment_id ?? null;
}
