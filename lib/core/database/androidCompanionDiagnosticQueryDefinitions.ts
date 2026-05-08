import { ANDROID_COMPANION_RESOURCE_STATUSES } from './androidCompanionSyncProtocolDefinitions.ts';
import { REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL } from './androidCompanionSyncPolicySql.ts';
export { ANDROID_COMPANION_DIAGNOSTIC_READ_RULES } from './androidCompanionDiagnosticReadRules.ts';

const RESOURCE_STATUS = ANDROID_COMPANION_RESOURCE_STATUSES;
const MISSING_TOPIC_BODY_WHERE =
  "n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND cb.kind = 'text_body' AND cbd.hash IS NULL";

const MISSING_TOPIC_BODY_FROM =
  'FROM nodes n JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
  'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash ';

const BLOCKING_ACK_WHERE =
  `(ack.status IN ('accepted', 'already_applied') OR ack.object_type IN (${REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL}))`;

const REVIEW_REQUIRED_PUSH_ISSUE_WHERE =
  `status IN ('conflict', 'rejected') AND object_type IN (${REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL})`;

const BODY_STATUS_WITH_BLOB_DATA_SQL =
  "CASE WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('" +
  RESOURCE_STATUS.fetching +
  "', '" +
  RESOURCE_STATUS.failed +
  "') THEN cb.availability " +
  "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN '" +
  RESOURCE_STATUS.missing +
  "' WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN '" +
  RESOURCE_STATUS.empty +
  "' ELSE '" +
  RESOURCE_STATUS.ready +
  "' END";

export const ANDROID_COMPANION_DIAGNOSTIC_QUERY_DEFINITIONS = {
  diagnosticStorageMetrics: {
    resultKey: 'metrics',
    sql:
      "SELECT 'active_node_count' AS metric, COUNT(*) AS value FROM nodes WHERE deleted_at IS NULL " +
      "UNION ALL SELECT 'external_document_count' AS metric, COUNT(*) AS value FROM external_documents " +
      "UNION ALL SELECT 'content_blob_count' AS metric, COUNT(*) AS value FROM content_blobs " +
      "UNION ALL SELECT 'missing_node_state_count' AS metric, COUNT(*) AS value FROM nodes n LEFT JOIN sync_object_state s " +
      "ON s.object_type = 'node' AND s.object_id = n.id WHERE n.deleted_at IS NULL AND s.object_id IS NULL " +
      "UNION ALL SELECT 'missing_node_version_count' AS metric, COUNT(*) AS value FROM nodes WHERE deleted_at IS NULL " +
      "AND (current_version_id IS NULL OR current_version_id = '') " +
      "UNION ALL SELECT 'node_blob_references_missing_rows' AS metric, COUNT(*) AS value FROM nodes n " +
      'LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
      'WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND cb.hash IS NULL',
    columns: [
      { key: 'metric', source: 'metric', type: 'string' },
      { key: 'value', source: 'value', type: 'long' }
    ]
  },
  diagnosticContentBodyMetrics: {
    resultKey: 'metrics',
    sql:
      "SELECT 'missing_topic_body_count' AS metric, COUNT(DISTINCT n.body_blob_hash) AS value " +
      MISSING_TOPIC_BODY_FROM +
      'WHERE ' +
      MISSING_TOPIC_BODY_WHERE +
      " UNION ALL SELECT 'missing_top_level_topic_body_count' AS metric, COUNT(DISTINCT n.body_blob_hash) AS value " +
      MISSING_TOPIC_BODY_FROM +
      'WHERE n.parent_id IS NULL AND ' +
      MISSING_TOPIC_BODY_WHERE +
      " UNION ALL SELECT 'missing_nested_topic_body_count' AS metric, COUNT(DISTINCT n.body_blob_hash) AS value " +
      MISSING_TOPIC_BODY_FROM +
      'WHERE n.parent_id IS NOT NULL AND ' +
      MISSING_TOPIC_BODY_WHERE +
      " UNION ALL SELECT 'missing_external_document_body_count' AS metric, COUNT(DISTINCT ed.body_blob_hash) AS value " +
      'FROM external_documents ed JOIN content_blobs cb ON cb.hash = ed.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash ' +
      "WHERE ed.is_present = 1 AND ed.body_blob_hash IS NOT NULL AND cb.kind = 'text_body' AND cbd.hash IS NULL " +
      "UNION ALL SELECT 'missing_due_review_body_count' AS metric, COUNT(DISTINCT n.body_blob_hash) AS value " +
      MISSING_TOPIC_BODY_FROM +
      'JOIN node_review nr ON nr.node_id = n.id ' +
      'WHERE nr.due <= strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') AND ' +
      MISSING_TOPIC_BODY_WHERE +
      " UNION ALL SELECT 'missing_active_topic_body_count' AS metric, COUNT(DISTINCT n.body_blob_hash) AS value " +
      MISSING_TOPIC_BODY_FROM +
      "WHERE n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) AND " +
      MISSING_TOPIC_BODY_WHERE,
    columns: [
      { key: 'metric', source: 'metric', type: 'string' },
      { key: 'value', source: 'value', type: 'long' }
    ]
  },
  diagnosticActiveTopic: {
    resultKey: 'topics',
    sql:
      'SELECT n.id, n.title, ' +
      BODY_STATUS_WITH_BLOB_DATA_SQL +
      ' AS body_status ' +
      'FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
      'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash ' +
      "WHERE n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) " +
      'AND n.deleted_at IS NULL LIMIT 1',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'title', source: 'title', type: 'nullableString' },
      { key: 'body_status', source: 'body_status', type: 'string' }
    ]
  },
  diagnosticRecentTopics: {
    resultKey: 'topics',
    sql:
      'SELECT n.id, n.title, n.body_blob_hash, cb.availability AS blob_availability FROM nodes n ' +
      'LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
      'WHERE n.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT 20',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'title', source: 'title', type: 'nullableString' },
      { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' },
      { key: 'blob_availability', source: 'blob_availability', type: 'nullableString' }
    ]
  },
  diagnosticSyncStateMetrics: {
    resultKey: 'metrics',
    sql:
      "SELECT 'max_state_seq' AS metric, COALESCE(MAX(state_seq), 0) AS value FROM sync_object_state " +
      "UNION ALL SELECT 'local_dirty_count' AS metric, COUNT(*) AS value FROM sync_object_state WHERE sync_dirty = 1 AND object_type <> 'view_state' " +
      "UNION ALL SELECT 'ready_dirty_count' AS metric, COUNT(*) AS value FROM sync_object_state state WHERE state.sync_dirty = 1 " +
      "AND state.object_type <> 'view_state' " +
      'AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = state.object_type AND ack.object_id = state.object_id ' +
      'AND ' +
      BLOCKING_ACK_WHERE +
      ') ' +
      "UNION ALL SELECT 'pending_ack_count' AS metric, COUNT(*) AS value FROM sync_push_ack WHERE status IN ('accepted', 'already_applied') " +
      "UNION ALL SELECT 'push_issue_count' AS metric, COUNT(*) AS value FROM sync_push_ack WHERE " +
      REVIEW_REQUIRED_PUSH_ISSUE_WHERE,
    columns: [
      { key: 'metric', source: 'metric', type: 'string' },
      { key: 'value', source: 'value', type: 'long' }
    ]
  },
  diagnosticSyncStateCounts: {
    resultKey: 'counts',
    sql:
      'SELECT state.object_type, COUNT(*) AS count, SUM(CASE WHEN state.sync_dirty = 1 THEN 1 ELSE 0 END) AS dirty_count, ' +
      'MIN(state.state_seq) AS min_state_seq, MAX(state.state_seq) AS max_state_seq, ' +
      'COALESCE(pending.count, 0) AS pending_ack_count, COALESCE(issues.count, 0) AS push_issue_count, ' +
      'SUM(CASE WHEN state.sync_dirty = 1 AND NOT EXISTS (' +
      'SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = state.object_type AND ack.object_id = state.object_id' +
      ' AND ' +
      BLOCKING_ACK_WHERE +
      ') THEN 1 ELSE 0 END) AS ready_dirty_count FROM sync_object_state state ' +
      "LEFT JOIN (SELECT object_type, COUNT(*) AS count FROM sync_push_ack WHERE status IN ('accepted', 'already_applied') GROUP BY object_type) pending " +
      'ON pending.object_type = state.object_type ' +
      'LEFT JOIN (SELECT object_type, COUNT(*) AS count FROM sync_push_ack WHERE ' +
      REVIEW_REQUIRED_PUSH_ISSUE_WHERE +
      ' GROUP BY object_type) issues ' +
      "ON issues.object_type = state.object_type WHERE state.object_type <> 'view_state' " +
      'GROUP BY state.object_type ORDER BY state.object_type ASC',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'count', source: 'count', type: 'long' },
      { key: 'dirty_count', source: 'dirty_count', type: 'long' },
      { key: 'min_state_seq', source: 'min_state_seq', type: 'long' },
      { key: 'max_state_seq', source: 'max_state_seq', type: 'long' },
      { key: 'pending_ack_count', source: 'pending_ack_count', type: 'long' },
      { key: 'push_issue_count', source: 'push_issue_count', type: 'long' },
      { key: 'ready_dirty_count', source: 'ready_dirty_count', type: 'long' }
    ]
  },
  diagnosticDirtyObjects: {
    resultKey: 'objects',
    sql:
      'SELECT object_type, object_id, content_hash, state_seq, updated_at, base_content_hash ' +
      "FROM sync_object_state WHERE sync_dirty = 1 AND object_type <> 'view_state' " +
      'AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = sync_object_state.object_type ' +
      'AND ack.object_id = sync_object_state.object_id AND ' +
      BLOCKING_ACK_WHERE +
      ') ORDER BY state_seq DESC LIMIT 50',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'nullableString' },
      { key: 'state_seq', source: 'state_seq', type: 'long' },
      { key: 'updated_at', source: 'updated_at', type: 'nullableString' },
      { key: 'base_content_hash', source: 'base_content_hash', type: 'nullableString' }
    ]
  },
  diagnosticPendingAcks: {
    resultKey: 'acks',
    sql:
      "SELECT client_op_id, object_type, object_id, state_seq, status, acked_at FROM sync_push_ack WHERE status IN ('accepted', 'already_applied') " +
      'ORDER BY acked_at ASC LIMIT 50',
    columns: [
      { key: 'client_op_id', source: 'client_op_id', type: 'string' },
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'state_seq', source: 'state_seq', type: 'long' },
      { key: 'status', source: 'status', type: 'string' },
      { key: 'acked_at', source: 'acked_at', type: 'string' }
    ]
  },
  diagnosticPushIssues: {
    resultKey: 'acks',
    sql:
      "SELECT client_op_id, object_type, object_id, state_seq, status, acked_at FROM sync_push_ack WHERE status IN ('conflict', 'rejected') " +
      `AND object_type IN (${REVIEW_REQUIRED_PUSH_ISSUE_TYPES_SQL}) ` +
      'ORDER BY acked_at ASC LIMIT 50',
    columns: [
      { key: 'client_op_id', source: 'client_op_id', type: 'string' },
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'state_seq', source: 'state_seq', type: 'long' },
      { key: 'status', source: 'status', type: 'string' },
      { key: 'acked_at', source: 'acked_at', type: 'string' }
    ]
  }
};
