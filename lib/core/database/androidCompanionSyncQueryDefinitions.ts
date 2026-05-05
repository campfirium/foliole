export const ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS = {
  syncIndex: {
    resultKey: 'entries',
    sql:
      'SELECT object_type, object_id, current_version_id, content_hash, updated_at ' +
      "FROM sync_object_state WHERE object_type <> 'node' ORDER BY updated_at ASC, object_type ASC, object_id ASC",
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'sync_version_id', source: 'current_version_id', type: 'nullableString' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' }
    ]
  },
  syncStateChanges: {
    resultKey: 'objects',
    sql:
      'SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at, base_content_hash ' +
      "FROM sync_object_state WHERE object_type <> 'node' AND sync_dirty = 1 AND state_seq > ? " +
      'AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = sync_object_state.object_type ' +
      'AND ack.object_id = sync_object_state.object_id) ORDER BY state_seq ASC LIMIT ?',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'state_seq', source: 'state_seq', type: 'long' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' },
      { key: 'base_content_hash', source: 'base_content_hash', type: 'nullableString' }
    ]
  },
  syncObjects: {
    resultKey: 'objects',
    sql:
      'SELECT object_type, object_id, content_hash, updated_at, deleted_at ' +
      "FROM sync_object_state WHERE object_type <> 'node' AND object_id IN (:objectIds) " +
      'AND (? = 0 OR object_type IN (:objectTypes)) ' +
      'ORDER BY updated_at ASC, object_type ASC, object_id ASC',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' }
    ]
  },
  nodeConflicts: {
    resultKey: 'conflicts',
    sql:
      'SELECT conflict_version_id, object_id, parent_version_id, device_id, ' +
      'content_hash, snapshot_json, detected_at FROM node_sync_conflicts ' +
      'ORDER BY detected_at DESC, conflict_version_id DESC',
    columns: [
      { key: 'conflict_version_id', source: 'conflict_version_id', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'parent_version_id', source: 'parent_version_id', type: 'nullableString' },
      { key: 'device_id', source: 'device_id', type: 'nullableString' },
      { key: 'content_hash', source: 'content_hash', type: 'nullableString' },
      { key: 'snapshot', source: 'snapshot_json', type: 'json' },
      { key: 'detected_at', source: 'detected_at', type: 'string' }
    ]
  },
  syncReviewLog: {
    resultKey: 'reviews',
    sql:
      'SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, ' +
      'due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after ' +
      'FROM review_log WHERE device_id = ? ' +
      "AND (? = '' OR ? = '' OR reviewed_at > ? OR (reviewed_at = ? AND op_id > ?)) " +
      'ORDER BY reviewed_at ASC, op_id ASC LIMIT ?',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'op_id', source: 'op_id', type: 'string' },
      { key: 'device_id', source: 'device_id', type: 'string' },
      { key: 'node_id', source: 'node_id', type: 'string' },
      { key: 'grade', source: 'grade', type: 'long' },
      { key: 'scheduler_version', source: 'scheduler_version', type: 'string' },
      { key: 'reviewed_at', source: 'reviewed_at', type: 'string' },
      { key: 'due_before', source: 'due_before', type: 'string' },
      { key: 'stability_before', source: 'stability_before', type: 'double' },
      { key: 'difficulty_before', source: 'difficulty_before', type: 'double' },
      { key: 'due_after', source: 'due_after', type: 'string' },
      { key: 'stability_after', source: 'stability_after', type: 'double' },
      { key: 'difficulty_after', source: 'difficulty_after', type: 'double' }
    ]
  },
  syncNodeVersions: {
    resultKey: 'nodes',
    sql:
      "SELECT v.version_id, v.object_id, 'node' AS object_type, v.parent_version_id, v.device_id, " +
      "v.created_at AS version_created_at, COALESCE(json_extract(v.snapshot_json, '$.updated_at'), v.created_at) AS updated_at, " +
      'v.content_hash, v.snapshot_json AS snapshot FROM node_sync_versions v INNER JOIN nodes n ON n.id = v.object_id ' +
      "WHERE v.device_id = ? AND (? = '' OR ? = '' OR v.created_at > ? OR (v.created_at = ? AND v.version_id > ?)) " +
      "AND v.object_id NOT LIKE 'conflict-copy-%' " +
      'AND n.current_version_id = v.version_id AND n.deleted_at IS NULL ORDER BY v.created_at ASC, v.version_id ASC LIMIT ?',
    columns: [
      { key: 'version_id', source: 'version_id', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'parent_version_id', source: 'parent_version_id', type: 'nullableString' },
      { key: 'device_id', source: 'device_id', type: 'string' },
      { key: 'version_created_at', source: 'version_created_at', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'snapshot', source: 'snapshot', type: 'json' }
    ]
  },
  syncNodeVersionParent: {
    sql: 'SELECT parent_version_id FROM node_sync_versions WHERE version_id = ? LIMIT 1'
  },
  companionMetaValue: {
    resultKey: 'rows',
    sql: 'SELECT value FROM companion_meta WHERE key = ? LIMIT 1',
    columns: [{ key: 'value', source: 'value', type: 'nullableString' }]
  },
  existingState: {
    resultKey: 'rows',
    sql: 'SELECT content_hash, base_content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1',
    columns: [
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'base_content_hash', source: 'base_content_hash', type: 'nullableString' },
      { key: 'sync_dirty', source: 'sync_dirty', type: 'long' }
    ]
  },
  nextStateSeq: {
    resultKey: 'rows',
    sql: 'SELECT COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq FROM sync_object_state',
    columns: [{ key: 'next_state_seq', source: 'next_state_seq', type: 'long' }]
  }
};

export const ANDROID_COMPANION_SYNC_OBJECT_READ_RULES = {
  groupKeys: {
    syncIndex: 'syncIndex',
    syncObjects: 'syncObjects',
    syncStateChanges: 'syncStateChanges'
  },
  syncIndex: {
    queryName: 'syncIndex'
  },
  syncObjects: {
    emptyResultKey: 'objects',
    objectIdsReplacement: ':objectIds',
    objectTypesReplacement: ':objectTypes',
    queryName: 'syncObjects',
    resultKey: 'objects',
    unfilteredObjectTypesReplacement: 'NULL'
  },
  syncStateChanges: {
    defaultLimit: 500,
    maxLimit: 1000,
    minCursor: 0,
    minLimit: 1,
    queryName: 'syncStateChanges',
    resultKey: 'objects'
  }
};

export const ANDROID_COMPANION_SYNC_STREAM_READ_RULES = {
  groupKeys: {
    nodeVersions: 'nodeVersions',
    reviewLog: 'reviewLog'
  },
  nodeVersions: {
    ancestorDepthLimit: 1000,
    ancestorVersionIdsKey: 'ancestor_version_ids',
    cursorChangeIdKey: 'change_id',
    cursorCreatedAtKey: 'created_at',
    defaultLimit: 500,
    emptyCursorValue: '',
    maxLimit: 1000,
    minLimit: 1,
    parentQueryName: 'syncNodeVersionParent',
    queryName: 'syncNodeVersions',
    resultKey: 'nodes',
    versionIdKey: 'version_id'
  },
  reviewLog: {
    cursorChangeIdKey: 'change_id',
    cursorCreatedAtKey: 'created_at',
    defaultLimit: 500,
    emptyCursorValue: '',
    maxLimit: 1000,
    minLimit: 1,
    queryName: 'syncReviewLog'
  }
};

export const ANDROID_COMPANION_SYNC_CONFLICT_READ_RULES = {
  groupKeys: {
    nodeConflicts: 'nodeConflicts'
  },
  nodeConflicts: {
    queryName: 'nodeConflicts'
  }
} as const;

export const ANDROID_COMPANION_RUNTIME_QUERY_RULES = {
  companionMeta: {
    queryName: 'companionMetaValue'
  },
  existingState: {
    baseContentHashKey: 'base_content_hash',
    contentHashKey: 'content_hash',
    queryName: 'syncStateExistingForMutation',
    resultKey: 'rows',
    syncDirtyKey: 'sync_dirty'
  },
  nextStateSeq: {
    nextStateSeqKey: 'next_state_seq',
    queryName: 'syncStateNextSeqForMutation',
    resultKey: 'rows'
  }
} as const;
