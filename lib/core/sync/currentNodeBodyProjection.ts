import type { DbPort } from './dbPort.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import { hashTextBodyContent } from './syncNodeTextBodyBlobs.js';

/** Restore a clean current projection from its verified immutable version inside the caller's transaction. */
export async function reconcileCurrentNodeBody(port: DbPort, nodeId: string, enqueueSearchInvalidations: boolean) {
  const [row] = await port.query<{ current_version_id: string; body_blob_hash: string | null; body_text: string }>(
    `SELECT n.current_version_id, n.body_blob_hash, version.body_text FROM nodes n
     JOIN node_sync_versions version ON version.version_id = n.current_version_id AND version.object_id = n.id
     WHERE n.id = ? AND n.sync_dirty = 0 AND (n.body_blob_hash IS NOT NULL OR n.content = '')
       AND version.body_text IS NOT NULL AND n.content IS NOT version.body_text`, [nodeId]);
  if (!row) return;
  const hash = await hashTextBodyContent(row.body_text, {});
  if (row.body_blob_hash !== null && row.body_blob_hash !== hash) return;
  const result = await port.run(`UPDATE nodes SET content = ?, body_blob_hash = ?
    WHERE id = ? AND current_version_id = ? AND sync_dirty = 0 AND body_blob_hash IS ?`,
  [row.body_text, hash, nodeId, row.current_version_id, row.body_blob_hash]);
  if (result.changes !== 1) throw new Error(`sync_body_projection_changed:${nodeId}`);
  if (enqueueSearchInvalidations) await enqueueAppliedNodeBodySearchInvalidation(port, nodeId, new Date().toISOString());
}
