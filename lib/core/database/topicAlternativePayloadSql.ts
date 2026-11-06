export const TOPIC_ALTERNATIVE_PAYLOAD_SQL = `SELECT json_object(
  'alternative_id', alternative_id, 'node_id', node_id, 'source_version_id', source_version_id,
  'body_text', body_text, 'body_blob_hash', body_blob_hash, 'source_host_name', source_host_name,
  'created_at', created_at, 'expires_at', expires_at, 'resource_references', resource_references,
  'image_sources', image_sources, 'status', status, 'updated_at', updated_at
) AS payload_json FROM node_text_alternatives WHERE alternative_id = ?`;
