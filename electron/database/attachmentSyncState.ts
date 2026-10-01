import { LEGACY_ATTACHMENT_PAYLOAD_SQL } from '../../lib/core/database/attachmentMetadataSql.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';

import { loadOrCreateDesktopHostName } from './hostProfile.js';

/** Used only while upgrading the historical attachment registry. */
export function refreshAttachmentSyncState(driver: DatabaseDriver, attachmentId: string, updatedAt: string) {
  const row = driver.queryOne<{ payload_json: string }>(LEGACY_ATTACHMENT_PAYLOAD_SQL, [attachmentId]);
  if (!row) throw new Error(`attachment_metadata_missing:${attachmentId}`);
  const contentHash = computeSyncContentHash('attachment', JSON.parse(row.payload_json));
  upsertSyncObjectState(driver, {
    objectType: 'attachment', objectId: attachmentId, contentHash,
    lastModifiedByHostName: loadOrCreateDesktopHostName(updatedAt), updatedAt, syncDirty: true
  });
}
