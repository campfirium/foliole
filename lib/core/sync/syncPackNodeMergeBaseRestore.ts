import type { DbPort } from './dbPort.js';
import { loadMergeBase, storedSyncNodeVersionBody } from './syncNodeGraph.js';

/** A returning branch can supply the full common base after this device trimmed it. */
export async function restoreIncomingNodeMergeBases(port: DbPort, alias: string) {
  const heads = await port.query<{
    incoming_version_id: string;
    local_version_id: string;
  }>(`SELECT incoming.current_version_id AS incoming_version_id,
       local.current_version_id AS local_version_id
     FROM ${alias}.nodes incoming JOIN main.nodes local ON local.id = incoming.id
     WHERE incoming.current_version_id IS NOT NULL AND local.current_version_id IS NOT NULL
       AND incoming.current_version_id <> local.current_version_id
       AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones tomb WHERE tomb.node_id = incoming.id)
       AND EXISTS (SELECT 1 FROM main.node_sync_versions stored
         JOIN ${alias}.node_sync_versions available ON available.version_id = stored.version_id
         WHERE stored.object_id = incoming.id
           AND json_type(stored.snapshot_json, '$.content') = 'null'
           AND (available.body_text IS NOT NULL
             OR json_type(available.snapshot_json, '$.content') = 'text'
             OR json_type(available.snapshot_json, '$.content') IS NULL))`);
  for (const head of heads) {
    const base = await loadMergeBase(port, head.local_version_id, head.incoming_version_id);
    if (!base || storedSyncNodeVersionBody(base) !== null) continue;
    await port.run(
      `UPDATE main.node_sync_versions AS stored SET
         body_text = CASE WHEN incoming.body_text IS NOT NULL THEN incoming.body_text
           WHEN json_type(incoming.snapshot_json, '$.content') = 'text'
             THEN json_extract(incoming.snapshot_json, '$.content')
           WHEN json_type(incoming.snapshot_json, '$.content') IS NULL THEN '' ELSE NULL END,
         snapshot_json = incoming.snapshot_json
       FROM ${alias}.node_sync_versions AS incoming
       WHERE stored.version_id = ? AND incoming.version_id = stored.version_id
         AND (incoming.body_text IS NOT NULL
           OR json_type(incoming.snapshot_json, '$.content') = 'text'
           OR json_type(incoming.snapshot_json, '$.content') IS NULL)`,
      [base.version_id]
    );
  }
}
