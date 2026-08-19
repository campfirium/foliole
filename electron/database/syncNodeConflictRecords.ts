import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

export function recordRemoteNodeConflict(driver: DatabaseDriver, record: NativeSyncNodeRecord, timestamp: string) {
  if (!record.version_id) {
    return;
  }
  driver.execute(
    `INSERT INTO node_sync_conflicts (
       conflict_version_id,
       object_id,
       parent_version_id,
       host_name,
       content_hash,
       snapshot_json,
       detected_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(conflict_version_id) DO UPDATE SET
       object_id = excluded.object_id,
       parent_version_id = excluded.parent_version_id,
       host_name = excluded.host_name,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json,
       detected_at = excluded.detected_at`,
    [
      record.version_id,
      record.object_id,
      record.parent_version_id,
      record.host_name,
      record.content_hash,
      JSON.stringify(record.snapshot),
      timestamp
    ]
  );
}
