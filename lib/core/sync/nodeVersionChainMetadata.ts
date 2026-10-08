/** Read retention flags from the selected schema without transporting historical body strings. */
export function nodeVersionChainMetadataSql() {
  const available = "body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text' OR json_type(snapshot_json, '$.content') IS NULL";
  const releasable = "json_type(snapshot_json, '$.body_blob_hash') = 'text'";
  return `SELECT version_id, object_id, parent_version_id,
    CASE WHEN ${available} THEN 1 ELSE 0 END AS body_available,
    CASE WHEN ${releasable} THEN 1 ELSE 0 END AS body_releasable
    FROM node_sync_versions version WHERE object_id = ?`;
}

export const CHAIN_VERSION_METADATA_SQL = nodeVersionChainMetadataSql();
