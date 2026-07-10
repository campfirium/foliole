import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';

export async function upsertAppliedNodeSyncState(port: DbPort, record: NativeSyncNodeRecord) {
  await port.run(
    `INSERT INTO sync_object_state (
       object_type,
       object_id,
       state_seq,
       current_version_id,
       content_hash,
       last_modified_by_device_id,
       updated_at,
       deleted_at,
       sync_dirty
     ) VALUES (
       'node',
       ?,
       COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1),
       ?,
       ?,
       ?,
       ?,
       ?,
       0
     )
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       state_seq = excluded.state_seq,
       current_version_id = excluded.current_version_id,
       content_hash = excluded.content_hash,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       sync_dirty = excluded.sync_dirty
     WHERE sync_object_state.current_version_id IS NOT excluded.current_version_id
       OR sync_object_state.content_hash IS NOT excluded.content_hash
       OR sync_object_state.last_modified_by_device_id IS NOT excluded.last_modified_by_device_id
       OR sync_object_state.updated_at IS NOT excluded.updated_at
       OR sync_object_state.deleted_at IS NOT excluded.deleted_at
       OR sync_object_state.sync_dirty IS NOT excluded.sync_dirty`,
    [
      record.object_id,
      record.version_id,
      record.content_hash ?? '',
      record.device_id,
      record.updated_at,
      record.snapshot.deleted_at
    ]
  );
}
