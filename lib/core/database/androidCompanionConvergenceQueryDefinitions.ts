export const ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS = {
  nodeTextAlternativeAvailable: {
    resultKey: 'rows',
    sql:
      'SELECT alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at ' +
      "FROM node_text_alternatives WHERE node_id = ? AND status = 'available' " +
      'ORDER BY updated_at DESC, alternative_id ASC LIMIT 1',
    columns: alternativeColumns()
  },
  nodeTextAlternativeById: {
    resultKey: 'rows',
    sql:
      'SELECT alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at ' +
      'FROM node_text_alternatives WHERE alternative_id = ? LIMIT 1',
    columns: alternativeColumns()
  },
  nodeExistsById: {
    resultKey: 'rows',
    sql: 'SELECT id FROM nodes WHERE id = ? LIMIT 1',
    columns: [{ key: 'id', source: 'id', type: 'string' }]
  },
  nodeByIdForRekey: {
    resultKey: 'rows',
    sql:
      'SELECT parent_id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled, shelved_at, ' +
      'manual_child_order, title, is_title_manual, hide_title_heading, content, body_blob_hash, opening_text, virtual_filter, ' +
      'reveal, anchor_link, anchor_resolution_status, anchor_source_version_id, image_regions, import_source_fingerprint, ' +
      'import_content_fingerprint, position, current_version_id, last_modified_by_host_name, sync_dirty, created_at, updated_at, deleted_at ' +
      'FROM nodes WHERE id = ? LIMIT 1',
    columns: nodeRekeyColumns()
  },
  nodeVersionsForRekey: {
    resultKey: 'rows',
    sql: 'SELECT version_id, snapshot_json FROM node_sync_versions WHERE object_id = ? ORDER BY version_id',
    columns: [
      { key: 'version_id', source: 'version_id', type: 'string' },
      { key: 'snapshot_json', source: 'snapshot_json', type: 'nullableString' }
    ]
  }
};

function alternativeColumns() {
  return [
    { key: 'alternative_id', source: 'alternative_id', type: 'string' },
    { key: 'node_id', source: 'node_id', type: 'string' },
    { key: 'source_version_id', source: 'source_version_id', type: 'string' },
    { key: 'body_text', source: 'body_text', type: 'string' },
    { key: 'source_host_name', source: 'source_host_name', type: 'string' },
    { key: 'created_at', source: 'created_at', type: 'string' },
    { key: 'status', source: 'status', type: 'string' },
    { key: 'updated_at', source: 'updated_at', type: 'string' }
  ] as const;
}

function nodeRekeyColumns() {
  const longs = new Set([
    'priority', 'enable_short_term', 'sequential_reading_enabled', 'is_title_manual',
    'hide_title_heading', 'position', 'sync_dirty'
  ]);
  const doubles = new Set(['desired_retention']);
  return [
    'parent_id', 'kind', 'priority', 'desired_retention', 'enable_short_term', 'sequential_reading_enabled', 'shelved_at',
    'manual_child_order', 'title', 'is_title_manual', 'hide_title_heading', 'content', 'body_blob_hash', 'opening_text',
    'virtual_filter', 'reveal', 'anchor_link', 'anchor_resolution_status', 'anchor_source_version_id', 'image_regions',
    'import_source_fingerprint', 'import_content_fingerprint', 'position', 'current_version_id',
    'last_modified_by_host_name', 'sync_dirty', 'created_at', 'updated_at', 'deleted_at'
  ].map((key) => ({ key, source: key, type: longs.has(key) ? 'long' : doubles.has(key) ? 'double' : 'nullableString' }));
}
