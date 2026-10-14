import { ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS } from './androidCompanionConvergenceQueryDefinitions.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

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
      'SELECT conflict_version_id, object_id, parent_version_id, host_name, ' +
      'content_hash, snapshot_json, detected_at FROM node_sync_conflicts ' +
      'ORDER BY detected_at DESC, conflict_version_id DESC',
    columns: [
      { key: 'conflict_version_id', source: 'conflict_version_id', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'parent_version_id', source: 'parent_version_id', type: 'nullableString' },
      { key: 'host_name', source: 'host_name', type: 'nullableString' },
      { key: 'content_hash', source: 'content_hash', type: 'nullableString' },
      { key: 'snapshot', source: 'snapshot_json', type: 'json' },
      { key: 'detected_at', source: 'detected_at', type: 'string' }
    ]
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
    sql: `SELECT ${NEXT_SYNC_STATE_SEQ_SQL} AS next_state_seq`,
    columns: [{ key: 'next_state_seq', source: 'next_state_seq', type: 'long' }]
  }
};

export const ANDROID_COMPANION_SYNC_OBJECT_READ_RULES = {
  groupKeys: {
    syncIndex: 'syncIndex',
    syncObjects: 'syncObjects',
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
