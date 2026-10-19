import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

export function migrateExternalFolderDisplayPaths(db: DatabaseMigrationTarget) {
  const folders = db.prepare(`SELECT f.id, state.content_hash, state.updated_at,
    json_extract(s.type_settings_json, '$.ownerDeviceIdentityKey') = COALESCE(
      (SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'),
      (SELECT json_extract(value, '$') FROM settings WHERE key = 'standalone_device_uuid')) AS local_owner
    FROM external_search_folders f JOIN desktop_sources s ON s.source_ref = f.source_ref
    JOIN sync_object_state state ON state.object_type = 'external_folder' AND state.object_id = f.id
    WHERE state.deleted_at IS NULL AND f.folder_path <> ''`).all() as Array<{
      id: string; content_hash: string; updated_at: string; local_owner: number | null;
    }>;
  const now = Date.now();
  for (const folder of folders) {
    const [row] = db.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder).all(folder.id) as Array<{ payload_json: string }>;
    if (!row) continue;
    const hash = computeSyncContentHash('external_folder', JSON.parse(row.payload_json));
    if (hash === folder.content_hash) continue;
    // Only the provider publishes a new path fact; mirrors retain the original clock.
    const updatedAt = folder.local_owner
      ? new Date(Math.max(now, Date.parse(folder.updated_at) + 1)).toISOString() : folder.updated_at;
    db.prepare(`UPDATE sync_object_state SET base_content_hash = COALESCE(base_content_hash, content_hash),
      content_hash = ?, updated_at = ?, state_seq = ${NEXT_SYNC_STATE_SEQ_SQL}, sync_dirty = 1
      WHERE object_type = 'external_folder' AND object_id = ?`).run(hash, updatedAt, folder.id);
  }
}
