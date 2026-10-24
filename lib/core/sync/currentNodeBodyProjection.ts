import type { DbPort } from './dbPort.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import { hashTextBodyContent } from './syncNodeTextBodyBlobs.js';

type DriftedBody = { id: string; current_version_id: string; body_blob_hash: string | null; body_text: string };
const DRIFTED_BODY_SQL = `SELECT n.id, n.current_version_id, n.body_blob_hash, version.body_text FROM nodes n
     JOIN node_sync_versions version ON version.version_id = n.current_version_id AND version.object_id = n.id
     WHERE n.id IN (SELECT value FROM json_each(?)) AND n.sync_dirty = 0 AND (n.body_blob_hash IS NOT NULL OR n.content = '')
       AND version.body_text IS NOT NULL AND n.content IS NOT version.body_text`;

/** Restore a clean current projection from its verified immutable version inside the caller's transaction. */
export async function reconcileCurrentNodeBody(port: DbPort, nodeId: string, enqueueSearchInvalidations: boolean) {
  await reconcileCurrentNodeBodies(port, [nodeId], enqueueSearchInvalidations);
}

/** One read finds the nodes whose projected body drifted from their current version; only those are written. */
export async function reconcileCurrentNodeBodies(port: DbPort, nodeIds: readonly string[], enqueueSearchInvalidations: boolean) {
  if (!nodeIds.length) return;
  for (const row of await port.query<DriftedBody>(DRIFTED_BODY_SQL, [JSON.stringify(nodeIds)])) {
    await restoreDriftedBody(port, row, enqueueSearchInvalidations);
  }
}

async function restoreDriftedBody(port: DbPort, row: DriftedBody, enqueueSearchInvalidations: boolean) {
  const nodeId = row.id;
  const hash = await hashTextBodyContent(row.body_text, {});
  if (row.body_blob_hash !== null && row.body_blob_hash !== hash) return;
  const result = await port.run(`UPDATE nodes SET content = ?, body_blob_hash = ?
    WHERE id = ? AND current_version_id = ? AND sync_dirty = 0 AND body_blob_hash IS ?`,
  [row.body_text, hash, nodeId, row.current_version_id, row.body_blob_hash]);
  if (result.changes !== 1) throw new Error(`sync_body_projection_changed:${nodeId}`);
  if (enqueueSearchInvalidations) await enqueueAppliedNodeBodySearchInvalidation(port, nodeId, new Date().toISOString());
}
