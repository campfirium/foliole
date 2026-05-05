export const ANDROID_COMPANION_MUTATION_DEFINITIONS = {
  syncPushAckDeleteByObject: 'DELETE FROM sync_push_ack WHERE object_type = ? AND object_id = ?',
  syncPushAckDeleteIssuesByObject:
    "DELETE FROM sync_push_ack WHERE object_type = ? AND object_id = ? AND status IN ('conflict', 'rejected')",
  syncPushAckUpsert:
    'INSERT OR REPLACE INTO sync_push_ack (client_op_id, object_type, object_id, state_seq, status, acked_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?)',
  syncPushAckTableExists: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_push_ack' LIMIT 1",
  syncStateExisting:
    'SELECT content_hash, base_content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1',
  syncStateNextSeq: 'SELECT COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq FROM sync_object_state',
  syncStateUpsert:
    'INSERT OR REPLACE INTO sync_object_state (' +
    'object_type, object_id, state_seq, current_version_id, content_hash, base_content_hash, ' +
    'last_modified_by_device_id, updated_at, deleted_at, sync_dirty' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
};
