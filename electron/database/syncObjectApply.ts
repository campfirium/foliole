import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';
import { applySyncObjectPayload } from './syncObjectApplyPayloads.js';

const REMOTE_DEVICE_ID = 'sync-remote';

export function applySyncObjects(records: NativeSyncObjectRecord[]) {
  if (records.length === 0) return [];
  const connection = openDatabaseConnection();
  const appliedIds: string[] = [];

  connection.driver.transaction(() => {
    for (const record of records) {
      applySyncObjectPayload(connection.driver, record);
      upsertSyncObjectState(connection.driver, {
        objectType: record.object_type,
        objectId: record.object_id,
        contentHash: record.content_hash,
        deletedAt: record.deleted_at,
        lastModifiedByDeviceId: REMOTE_DEVICE_ID,
        updatedAt: record.updated_at,
        syncDirty: false
      });
      appliedIds.push(`${record.object_type}:${record.object_id}`);
    }
  });

  return appliedIds;
}
