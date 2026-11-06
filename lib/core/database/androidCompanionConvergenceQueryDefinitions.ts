export const ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS = {
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
      'reveal, anchor_link, anchor_resolution_status, anchor_source_version_id, image_regions, image_sources, resource_references, import_source_fingerprint, ' +
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

function nodeRekeyColumns() {
  const longs = new Set([
    'priority', 'enable_short_term', 'sequential_reading_enabled', 'is_title_manual',
    'hide_title_heading', 'position', 'sync_dirty'
  ]);
  const doubles = new Set(['desired_retention']);
  return [
    'parent_id', 'kind', 'priority', 'desired_retention', 'enable_short_term', 'sequential_reading_enabled', 'shelved_at',
    'manual_child_order', 'title', 'is_title_manual', 'hide_title_heading', 'content', 'body_blob_hash', 'opening_text',
    'virtual_filter', 'reveal', 'anchor_link', 'anchor_resolution_status', 'anchor_source_version_id', 'image_regions', 'image_sources', 'resource_references',
    'import_source_fingerprint', 'import_content_fingerprint', 'position', 'current_version_id',
    'last_modified_by_host_name', 'sync_dirty', 'created_at', 'updated_at', 'deleted_at'
  ].map((key) => ({ key, source: key, type: longs.has(key) ? 'long' : doubles.has(key) ? 'double' : 'nullableString' }));
}
