import { READWISE_SOURCE_JOIN_SQL } from './workspaceReadwiseSourceSql.js';
import { SNAPSHOT_VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

// Node facts shared by learning readers and content projections exclude import sources.
export const COMPANION_SNAPSHOT_NODE_QUERY = {
  resultKey: 'nodes',
  sql:
    `${SNAPSHOT_VISIBLE_NODES_CTE_SQL} ` +
    'SELECT n.id, n.parent_id, n.kind, n.priority, n.desired_retention, n.enable_short_term, n.sequential_reading_enabled, n.shelved_at, n.initial_review_due, n.manual_child_order, n.title, n.is_title_manual, ' +
    "n.hide_title_heading, '' AS content, n.opening_text, " +
    "CASE WHEN TRIM(COALESCE(n.content, '')) = '' THEN 'empty' ELSE 'ready' END AS body_status, " +
    "CASE WHEN LENGTH(TRIM(COALESCE(n.content, ''))) > 0 THEN 1 ELSE 0 END AS has_content, " +
    "CASE WHEN substr(CAST(n.content AS TEXT), 1, 4) = '---' || char(10) " +
    "OR substr(CAST(n.content AS TEXT), 1, 5) = '---' || char(13) || char(10) " +
    "THEN substr(replace(n.content, char(13) || char(10), char(10)), 1, " +
    "instr(substr(replace(n.content, char(13) || char(10), char(10)), 5), char(10) || '---' || char(10)) + 8) " +
    'ELSE NULL END AS collection_source_content, ' +
    'n.virtual_filter, NULL AS reveal, CASE WHEN n.reveal IS NOT NULL THEN 1 ELSE 0 END AS has_reveal, ' +
    'n.anchor_link, n.image_regions, n.image_sources, n.resource_references, n.import_source_fingerprint, n.import_content_fingerprint, ' +
    'n.created_at, n.updated_at, n.deleted_at, n.current_version_id, ' +
    'NULL AS position, ' +
    'rd.interval_duration_ms, rd.interval_growth_factor, rd.last_handled_at, rd.next_at, rd.priority AS reading_priority, ' +
    'rds.reading_position, rd.repetition_count, rd.state AS reading_state, nr.due, nr.last_review_at, nr.state AS review_state, ' +
    'nr.stability, nr.difficulty, nr.elapsed_days, nr.scheduled_days, nr.reps, nr.lapses, n.body_blob_hash ' +
    'FROM nodes n LEFT JOIN visible_nodes visible ON visible.id = n.id ' +
    'LEFT JOIN node_reading rd ON rd.node_id = n.id AND visible.id IS NOT NULL ' +
    'LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ? AND visible.id IS NOT NULL ' +
    'LEFT JOIN node_review nr ON nr.node_id = n.id AND visible.id IS NOT NULL ' +
    'ORDER BY n.created_at ASC, n.id ASC',
  columns: [
    { key: 'id', source: 'id', type: 'string' },
    { key: 'parent_id', source: 'parent_id', type: 'nullableString' },
    { key: 'kind', source: 'kind', type: 'nullableString' },
    { key: 'priority', source: 'priority', type: 'long' },
    { key: 'desired_retention', source: 'desired_retention', type: 'double' },
    { key: 'enable_short_term', source: 'enable_short_term', type: 'long' },
    { key: 'sequential_reading_enabled', source: 'sequential_reading_enabled', type: 'long' },
    { key: 'shelved_at', source: 'shelved_at', type: 'nullableString' },
    { key: 'initial_review_due', source: 'initial_review_due', type: 'nullableString' },
    { key: 'manual_child_order', source: 'manual_child_order', type: 'nullableString' },
    { key: 'title', source: 'title', type: 'nullableString' },
    { key: 'is_title_manual', source: 'is_title_manual', type: 'long' },
    { key: 'hide_title_heading', source: 'hide_title_heading', type: 'long' },
    { key: 'content', source: 'content', type: 'nullableString' },
    { key: 'opening_text', source: 'opening_text', type: 'nullableString' },
    { key: 'body_status', source: 'body_status', type: 'string' },
    { key: 'has_content', source: 'has_content', type: 'long' },
    { key: 'collection_source_content', source: 'collection_source_content', type: 'nullableString' },
    { key: 'virtual_filter', source: 'virtual_filter', type: 'nullableString' },
    { key: 'reveal', source: 'reveal', type: 'nullableString' },
    { key: 'has_reveal', source: 'has_reveal', type: 'long' },
    { key: 'anchor_link', source: 'anchor_link', type: 'nullableString' },
    { key: 'image_regions', source: 'image_regions', type: 'nullableString' },
    { key: 'image_sources', source: 'image_sources', type: 'nullableString' },
    { key: 'resource_references', source: 'resource_references', type: 'string' },
    { key: 'import_source_fingerprint', source: 'import_source_fingerprint', type: 'nullableString' },
    { key: 'import_content_fingerprint', source: 'import_content_fingerprint', type: 'nullableString' },
    { key: 'created_at', source: 'created_at', type: 'string' },
    { key: 'updated_at', source: 'updated_at', type: 'string' },
    { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' },
    { key: 'current_version_id', source: 'current_version_id', type: 'nullableString' },
    { key: 'position', source: 'position', type: 'long' },
    { key: 'interval_duration_ms', source: 'interval_duration_ms', type: 'long' },
    { key: 'interval_growth_factor', source: 'interval_growth_factor', type: 'double' },
    { key: 'last_handled_at', source: 'last_handled_at', type: 'nullableString' },
    { key: 'next_at', source: 'next_at', type: 'nullableString' },
    { key: 'reading_priority', source: 'reading_priority', type: 'double' },
    { key: 'reading_position', source: 'reading_position', type: 'long' },
    { key: 'repetition_count', source: 'repetition_count', type: 'long' },
    { key: 'reading_state', source: 'reading_state', type: 'nullableString' },
    { key: 'due', source: 'due', type: 'nullableString' },
    { key: 'last_review_at', source: 'last_review_at', type: 'nullableString' },
    { key: 'review_state', source: 'review_state', type: 'long' },
    { key: 'stability', source: 'stability', type: 'double' },
    { key: 'difficulty', source: 'difficulty', type: 'double' },
    { key: 'elapsed_days', source: 'elapsed_days', type: 'long' },
    { key: 'scheduled_days', source: 'scheduled_days', type: 'long' },
    { key: 'reps', source: 'reps', type: 'long' },
    { key: 'lapses', source: 'lapses', type: 'long' },
    { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' }
  ]
};

// Complete workspace displays explicitly include source lifecycle state.
export const COMPANION_WORKSPACE_DISPLAY_NODE_QUERY = {
  ...COMPANION_SNAPSHOT_NODE_QUERY,
  sql: COMPANION_SNAPSHOT_NODE_QUERY.sql
    .replace('n.created_at, n.updated_at',
      "json_extract(readwise_source.remote_import_state_json, '$.remoteLifecycle') AS readwise_remote_lifecycle, n.created_at, n.updated_at")
    .replace('LEFT JOIN node_reading rd', `${READWISE_SOURCE_JOIN_SQL} LEFT JOIN node_reading rd`),
  columns: COMPANION_SNAPSHOT_NODE_QUERY.columns.flatMap(column => column.key === 'created_at'
    ? [{ key: 'readwise_remote_lifecycle', source: 'readwise_remote_lifecycle', type: 'nullableString' }, column]
    : [column])
};
