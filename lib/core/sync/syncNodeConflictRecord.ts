import type {
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';

export function toSyncNodeConflictRecord(record: NativeSyncNodeRecord): NativeSyncNodeConflictRecord {
  return {
    conflict_version_id: record.version_id,
    content_hash: record.content_hash,
    device_id: record.device_id,
    object_id: record.object_id,
    parent_version_id: record.parent_version_id,
    snapshot: record.snapshot,
    updated_at: record.updated_at
  };
}
