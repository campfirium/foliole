import { ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS } from './androidCompanionConvergenceQueryDefinitions.js';
import {
  ANDROID_COMPANION_SYNC_REVIEW_LOG_SQL,
  ANDROID_COMPANION_SYNC_STATE_CHANGES_SQL
} from './androidCompanionSyncDeliveryQuerySql.js';
import { ANDROID_COMPANION_SYNC_NODE_VERSIONS_SQL } from './androidCompanionSyncNodeVersionSql.js';

export const ANDROID_COMPANION_SYNC_QUERY_DEFINITIONS = {
  ...ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS,
  syncIndex: {
    resultKey: 'entries',
    sql:
      'SELECT object_type, object_id, current_version_id, content_hash, updated_at ' +
      "FROM sync_object_state WHERE object_type NOT IN ('node', 'view_state') " +
      'ORDER BY updated_at ASC, object_type ASC, object_id ASC',
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
    sql: ANDROID_COMPANION_SYNC_STATE_CHANGES_SQL,
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'state_seq', source: 'state_seq', type: 'long' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'last_modified_by_host_name', source: 'last_modified_by_host_name', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' },
      { key: 'base_content_hash', source: 'base_content_hash', type: 'nullableString' }
    ]
  },
  syncObjects: {
    resultKey: 'objects',
    sql:
      'SELECT object_type, object_id, content_hash, updated_at, deleted_at ' +
      "FROM sync_object_state WHERE object_type NOT IN ('node', 'view_state') AND object_id IN (:objectIds) " +
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
    sql: ANDROID_COMPANION_SYNC_REVIEW_LOG_SQL,
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'op_id', source: 'op_id', type: 'string' },
      { key: 'host_name', source: 'host_name', type: 'string' },
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
    sql: ANDROID_COMPANION_SYNC_NODE_VERSIONS_SQL,
    columns: [
      { key: 'version_id', source: 'version_id', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'parent_version_id', source: 'parent_version_id', type: 'nullableString' },
      { key: 'device_id', source: 'device_id', type: 'string' },
      { key: 'is_tombstone', source: 'is_tombstone', type: 'long' },
      { key: 'version_created_at', source: 'version_created_at', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'body_text', source: 'body_text', type: 'nullableString' },
      { key: 'snapshot', source: 'snapshot', type: 'json' }
    ]
  },
  syncNodeVersionParent: {
    sql: `SELECT parent_version_id FROM node_sync_version_parents
      WHERE version_id = ? ORDER BY ordinal ASC`
  },
  companionMetaValue: {
    resultKey: 'rows',
    sql: 'SELECT value FROM companion_meta WHERE key = ? LIMIT 1',
    columns: [{ key: 'value', source: 'value', type: 'nullableString' }]
  },
  syncStateExistingForMutation: {
    resultKey: 'rows',
    sql: 'SELECT content_hash, base_content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1',
    columns: [
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'base_content_hash', source: 'base_content_hash', type: 'nullableString' },
      { key: 'sync_dirty', source: 'sync_dirty', type: 'long' }
    ]
  },
  syncStateNextSeqForMutation: {
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
  groupKeys: {
    companionMeta: 'companionMeta',
    existingState: 'existingState',
    nextStateSeq: 'nextStateSeq'
  },
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
