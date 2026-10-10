import type { DbPort } from './dbPort.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import { hashTextBodyContent } from './syncNodeTextBodyBlobs.js';

/** Apply each selected complete version to its clean current business record in the pack transaction. */
export async function reconcileSyncPackInlineBodies(port: DbPort, incomingAlias: string,
  enqueueSearchInvalidations: boolean) {
  const alias = `"${incomingAlias.replaceAll('"', '""')}"`;
  let after = '';
  const now = new Date().toISOString();
  for (;;) {
    const [row] = await port.query<{ id: string; current_version_id: string; body_blob_hash: string | null; body_text: string }>(
      `SELECT n.id, n.current_version_id, n.body_blob_hash, version.body_text FROM main.nodes n
       JOIN main.node_sync_versions version ON version.version_id = n.current_version_id
         AND version.object_id = n.id
       WHERE n.id > ? AND n.id IN (SELECT id FROM ${alias}.nodes) AND n.sync_dirty = 0
         AND (n.body_blob_hash IS NOT NULL OR n.content = '')
         AND version.body_text IS NOT NULL AND n.content IS NOT version.body_text
       ORDER BY n.id LIMIT 1`, [after]);
    if (!row) return;
    after = row.id;
    const hash = await hashTextBodyContent(row.body_text, {});
    if (row.body_blob_hash !== null && row.body_blob_hash !== hash) continue;
    const result = await port.run(
      `UPDATE nodes SET content = ?, body_blob_hash = ?
       WHERE id = ? AND current_version_id = ? AND sync_dirty = 0 AND body_blob_hash IS ?`,
      [row.body_text, hash, row.id, row.current_version_id, row.body_blob_hash]);
    if (result.changes !== 1) throw new Error(`sync_body_projection_changed:${row.id}`);
    if (enqueueSearchInvalidations) await enqueueAppliedNodeBodySearchInvalidation(port, row.id, now);
  }
}
