export const READWISE_SOURCE_JOIN_SQL = `LEFT JOIN (
  SELECT latest_node_id, remote_import_state_json,
    ROW_NUMBER() OVER (PARTITION BY latest_node_id ORDER BY last_imported_at DESC) AS source_rank
  FROM import_sources WHERE remote_provider = 'readwise' AND latest_node_id IS NOT NULL
) readwise_source ON readwise_source.latest_node_id = n.id AND readwise_source.source_rank = 1`;
