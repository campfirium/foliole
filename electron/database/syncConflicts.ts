import type { NativeSyncNodeConflictRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';

function toSnapshotJson(conflict: NativeSyncNodeConflictRecord) {
  return JSON.stringify(conflict.snapshot);
}

export function recordSyncNodeConflicts(
  conflicts: NativeSyncNodeConflictRecord[],
  detectedAt = new Date().toISOString()
) {
  if (conflicts.length === 0) {
    return [];
  }
  const connection = openDatabaseConnection();
  const recordedIds: string[] = [];

  connection.driver.transaction(() => {
    for (const conflict of conflicts) {
      if (!conflict.conflict_version_id) {
        continue;
      }
      connection.driver.execute(
        `INSERT INTO node_sync_conflicts (
           conflict_version_id,
           object_id,
           parent_version_id,
           device_id,
           content_hash,
           snapshot_json,
           detected_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(conflict_version_id) DO UPDATE SET
           object_id = excluded.object_id,
           parent_version_id = excluded.parent_version_id,
           device_id = excluded.device_id,
           content_hash = excluded.content_hash,
           snapshot_json = excluded.snapshot_json,
           detected_at = excluded.detected_at`,
        [
          conflict.conflict_version_id,
          conflict.object_id,
          conflict.parent_version_id,
          conflict.device_id,
          conflict.content_hash,
          toSnapshotJson(conflict),
          detectedAt
        ]
      );
      recordedIds.push(conflict.conflict_version_id);
    }
  });

  return recordedIds;
}
