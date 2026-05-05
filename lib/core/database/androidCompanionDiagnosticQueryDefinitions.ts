const MISSING_TOPIC_BODY_WHERE =
  "n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND cb.kind = 'text_body' AND cbd.hash IS NULL";

const MISSING_TOPIC_BODY_FROM =
  'FROM nodes n JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
  'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash ';

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
      'SELECT n.id, n.title, CASE ' +
      "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability " +
      "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN 'missing' " +
      "WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN 'empty' ELSE 'ready' END AS body_status " +
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
  }
};
