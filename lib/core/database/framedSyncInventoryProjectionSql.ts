const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function framedSyncVersionSummarySql(where: string) {
  return `INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, object_id,
      CASE WHEN body_text IS NULL THEN NULL
        WHEN body_text = '' THEN '${EMPTY_BODY_HASH}'
        ELSE COALESCE(json_extract(snapshot_json, '$.body_blob_hash'),
          (SELECT body_blob_hash FROM nodes WHERE current_version_id = version.version_id)) END,
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(version.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]')
    FROM node_sync_versions version WHERE ${where};`;
}

export function framedSyncNodeInventorySql(id: string) {
  return `DELETE FROM framed_sync_inventory WHERE object_type = 'node' AND object_id IN (${id});
    INSERT INTO framed_sync_inventory
      (object_type, object_id, content_hash, frontier_json, relations_json, reviews_json, states_json, resources_json)
    SELECT 'node', state.object_id, state.content_hash,
      COALESCE((SELECT json_group_array(version_id) FROM (
        SELECT version_id FROM framed_sync_version_summary WHERE object_id = state.object_id
        ORDER BY version_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 3
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array(fact_id) FROM (
        SELECT fact_id FROM framed_sync_fact_summary WHERE object_id = state.object_id AND kind = 4
        ORDER BY fact_id)), '[]'),
      COALESCE((SELECT json_group_array('node_reading:' || content_hash) FROM sync_object_state
        WHERE object_type = 'node_reading' AND object_id = state.object_id), '[]'),
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT body_hash AS hash FROM framed_sync_version_summary
          WHERE version_id = state.current_version_id AND body_hash IS NOT NULL
        UNION SELECT resource.value AS hash FROM framed_sync_version_summary version,
          json_each(version.resource_hashes_json) resource
          WHERE version.version_id = state.current_version_id
            AND EXISTS (SELECT 1 FROM framed_sync_resource_availability availability
              WHERE availability.hash = resource.value AND availability.available = 1)
        ORDER BY hash)), '[]')
    FROM sync_object_state state WHERE state.object_type = 'node' AND state.object_id IN (${id})
      AND state.object_id NOT IN ('special-inbox', 'special-virtual-root')
      AND EXISTS (SELECT 1 FROM framed_sync_version_summary WHERE object_id = state.object_id);`;
}

export function framedSyncTombstoneSummarySql(where: string) {
  return `INSERT OR REPLACE INTO framed_sync_version_summary
    (version_id, object_id, body_hash, resource_hashes_json)
    SELECT version_id, node_id, '${EMPTY_BODY_HASH}',
      COALESCE((SELECT json_group_array(hash) FROM (
        SELECT DISTINCT substr(json_extract(value, '$.storage_key'), 1, 64) AS hash
        FROM json_each(COALESCE(json_extract(tomb.snapshot_json, '$.resource_references'), '[]'))
        ORDER BY hash)), '[]') FROM node_sync_tombstones tomb WHERE ${where};`;
}
