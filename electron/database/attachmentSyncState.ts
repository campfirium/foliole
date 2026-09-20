import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function recordAttachmentMetadata(attachmentId: string, updatedAt: string) {
  refreshAttachmentSyncState(openDatabaseConnection().driver, attachmentId, updatedAt);
}

export function refreshAttachmentSyncState(driver: DatabaseDriver, attachmentId: string, updatedAt: string) {
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.attachment, [attachmentId]);
  if (!row) throw new Error(`attachment_metadata_missing:${attachmentId}`);
  const contentHash = computeSyncContentHash('attachment', JSON.parse(row.payload_json));
  upsertSyncObjectState(driver, {
    objectType: 'attachment', objectId: attachmentId, contentHash,
    lastModifiedByHostName: loadOrCreateDesktopHostName(updatedAt), updatedAt, syncDirty: true
  });
}

export function recordAttachmentDeleted(driver: DatabaseDriver, attachmentId: string, deletedAt: string) {
  const hostName = loadOrCreateDesktopHostName(deletedAt);
  const payload = { attachment_id: attachmentId };
  const contentHash = computeSyncContentHash('attachment', { ...payload, deleted_at: deletedAt });
  upsertSyncObjectState(driver, {
    objectType: 'attachment',
    objectId: attachmentId,
    contentHash,
    lastModifiedByHostName: hostName,
    updatedAt: deletedAt,
    deletedAt,
    syncDirty: true
  });
}
