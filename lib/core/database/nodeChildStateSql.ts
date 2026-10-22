export const NODE_CHILD_STATE_TYPES = [
  'node_reading', 'node_review', 'node_open_state', 'parent_child_order',
  'node_text_alternative', 'topic_daily_count', 'import_source'
] as const;

export const NODE_CHILD_STATE_TYPES_SQL = NODE_CHILD_STATE_TYPES.map(type => `'${type}'`).join(',');

export function nodeChildOwnerSql(state: string) {
  return `CASE
    WHEN ${state}.object_type IN ('node_reading', 'node_review', 'node_open_state', 'parent_child_order')
      THEN ${state}.object_id
    WHEN ${state}.object_type = 'topic_daily_count' THEN substr(${state}.object_id, 12)
    ELSE (SELECT node_id FROM sync_node_child_owners owner
      WHERE owner.object_type = ${state}.object_type AND owner.object_id = ${state}.object_id) END`;
}

/** Which business row backs each node child state (and import sources), by its object id. */
export const NODE_CHILD_PAYLOAD_SOURCES = [
  ['node_reading', 'node_reading', 'node_id'], ['node_review', 'node_review', 'node_id'],
  ['node_open_state', 'node_open_state', 'node_id'], ['parent_child_order', 'parent_order_sources', 'parent_id'],
  ['node_text_alternative', 'node_text_alternatives', 'alternative_id'],
  ['topic_daily_count', 'topic_daily_count_entries', 'id'], ['import_source', 'import_sources', 'source_fingerprint']
] as const;

export function nodeChildPayloadExistsSql(state: string) {
  const sources = NODE_CHILD_PAYLOAD_SOURCES;
  return `(${state}.deleted_at IS NOT NULL OR CASE ${state}.object_type ${sources.map(([type, table, key]) =>
    `WHEN '${type}' THEN EXISTS (SELECT 1 FROM ${table} child WHERE child.${key} = ${state}.object_id)`
  ).join(' ')} ELSE 0 END)`;
}

export function nodeChildFactIdsSql(nodeId: string) {
  return `COALESCE((SELECT json_group_array(fact_id) FROM (
    SELECT json_array(child.object_type, child.object_id, child.content_hash) || '' AS fact_id
    FROM (
      SELECT * FROM sync_object_state WHERE object_type IN
        ('node_reading', 'node_review', 'node_open_state', 'parent_child_order') AND object_id = ${nodeId}
      UNION ALL SELECT * FROM sync_object_state WHERE object_type = 'topic_daily_count'
        AND substr(object_id, 12) = ${nodeId}
      UNION ALL SELECT indirect.* FROM sync_node_child_owners owner JOIN sync_object_state indirect
        ON indirect.object_type = owner.object_type AND indirect.object_id = owner.object_id
        WHERE owner.node_id = ${nodeId}
    ) child WHERE ${nodeChildPayloadExistsSql('child')}
    ORDER BY child.object_type, child.object_id)), '[]')`;
}

export const NODE_CHILD_OWNER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_node_child_owners (
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, node_id TEXT NOT NULL,
    PRIMARY KEY(object_type, object_id))`,
  'CREATE INDEX IF NOT EXISTS idx_sync_node_child_owners_node ON sync_node_child_owners(node_id)',
  `CREATE INDEX IF NOT EXISTS idx_sync_topic_daily_owner ON sync_object_state(substr(object_id, 12))
    WHERE object_type = 'topic_daily_count'`
];
