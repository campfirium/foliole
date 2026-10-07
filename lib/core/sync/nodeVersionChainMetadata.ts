import type { NodeVersionBodyStorage } from './syncNodeTombstoneVersion.js';

/** Read retention flags from the selected schema without transporting historical body strings. */
export function nodeVersionChainMetadataSql(bodyStorage: NodeVersionBodyStorage = 'continuous') {
  const available = bodyStorage === 'chunked' ?
    "body_state = 'readable' AND EXISTS (SELECT 1 FROM content_bodies body WHERE body.hash = version.body_blob_hash AND body.verified = 1)" :
    "body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text' OR json_type(snapshot_json, '$.content') IS NULL";
  const releasable = bodyStorage === 'chunked' ? 'body_blob_hash IS NOT NULL' :
    "json_type(snapshot_json, '$.body_blob_hash') = 'text'";
  return `SELECT version_id, object_id, parent_version_id,
    CASE WHEN ${available} THEN 1 ELSE 0 END AS body_available,
    CASE WHEN ${releasable} THEN 1 ELSE 0 END AS body_releasable
    FROM node_sync_versions version WHERE object_id = ?`;
}

export const CHAIN_VERSION_METADATA_SQL = nodeVersionChainMetadataSql();
