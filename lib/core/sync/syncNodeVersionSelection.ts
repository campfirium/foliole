import { retireOversizeNodeVersionBodies } from '../database/oversizeVersionBodyMigration.js';

import type { DbPort } from './dbPort.js';
import { loadRetainedSyncNodeVersionRecords } from './syncNodeGraph.js';
import { loadSyncNodeVersionParents } from './syncNodeLineage.js';
import { orderNodeVersionHistory } from './syncNodeVersionHistory.js';

/** Order identity metadata first; complete bodies are loaded one version at a time. */
export async function selectRetainedNodeVersionOrder(db: DbPort, versionIds: readonly string[], objectId: string) {
  const selected = [];
  for (const versionId of versionIds) {
    const rows = await db.query<{ object_id: string; version_id: string }>(
      `SELECT object_id, version_id FROM node_sync_versions WHERE version_id = ?
       UNION ALL SELECT node_id AS object_id, version_id FROM node_sync_tombstones WHERE version_id = ?`,
      [versionId, versionId]);
    const row = rows.at(-1);
    if (!row || row.object_id !== objectId) throw new Error(`framed_sync_outbound_node_fact_unavailable:${versionId}`);
    selected.push({ ...row, parent_version_id: null, parent_version_ids: await loadSyncNodeVersionParents(db, versionId) });
  }
  return orderNodeVersionHistory(selected);
}

export async function* streamRetainedNodeVersions(db: DbPort, versionIds: readonly string[], objectId: string) {
  await retireOversizeNodeVersionBodies(db, objectId);
  for (const metadata of await selectRetainedNodeVersionOrder(db, versionIds, objectId)) {
    const record = (await loadRetainedSyncNodeVersionRecords(db, [metadata.version_id])).get(metadata.version_id);
    if (!record || record.object_id !== objectId) {
      throw new Error(`framed_sync_outbound_node_fact_unavailable:${metadata.version_id}`);
    }
    yield record;
  }
}
