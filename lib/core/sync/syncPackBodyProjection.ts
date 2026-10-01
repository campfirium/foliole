import { projectNodeInlineContent } from '../database/nodeInlineProjection.js';

import { materializeCurrentVersionBodyBlobs } from './currentVersionBodyBlob.js';
import type { DbPort } from './dbPort.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import { hashTextBodyContent, upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';

/** Reconcile only this pack's clean, missing inline projections, before committing its cursor. */
export async function reconcileSyncPackInlineBodies(port: DbPort, incomingAlias: string,
  enqueueSearchInvalidations: boolean) {
  await materializeCurrentVersionBodyBlobs(port, { incomingAlias });
  const alias = `"${incomingAlias.replaceAll('"', '""')}"`;
  await refreshInlineBodyProjections(port, alias);
  let after = '';
  const now = new Date().toISOString();
  while (true) {
    const [row] = await port.query<{ id: string; current_version_id: string; body_text: string }>(
      `SELECT n.id, n.current_version_id, version.body_text FROM main.nodes n
       JOIN main.node_sync_versions version ON version.version_id = n.current_version_id
         AND version.object_id = n.id
       WHERE n.id > ? AND n.id IN (SELECT id FROM ${alias}.nodes)
         AND n.sync_dirty = 0
         AND n.body_blob_hash IS NULL AND n.content = ''
         AND version.body_text IS NOT NULL AND version.body_text <> ''
       ORDER BY n.id LIMIT 1`, [after]);
    if (!row) return;
    const hash = await hashTextBodyContent(row.body_text, {});
    await upsertTextBodyBlob(port, row.body_text, now, hash);
    const result = await port.run(
      `UPDATE nodes SET content = ?, body_blob_hash = ?
       WHERE id = ? AND current_version_id = ? AND sync_dirty = 0
         AND body_blob_hash IS NULL AND content = ''`,
      [projectNodeInlineContent(row.body_text), hash, row.id, row.current_version_id]);
    if (result.changes !== 1) throw new Error(`sync_body_projection_changed:${row.id}`);
    if (enqueueSearchInvalidations) await enqueueAppliedNodeBodySearchInvalidation(port, row.id, now);
    after = row.id;
  }
}

async function refreshInlineBodyProjections(port: DbPort, alias: string) {
  let after = '';
  for (;;) {
    const [row] = await port.query<{ id: string; body_blob_hash: string; body: string; content: string }>(
      `SELECT n.id, n.body_blob_hash, n.content, CAST(data.data AS TEXT) AS body
       FROM nodes n JOIN content_blob_data data ON data.hash = n.body_blob_hash
       WHERE n.id > ? AND n.sync_dirty = 0 AND n.id IN (SELECT id FROM ${alias}.nodes)
       ORDER BY n.id LIMIT 1`, [after]);
    if (!row) return;
    const projection = projectNodeInlineContent(row.body);
    if (row.content !== projection && (row.content === '' || row.content === row.body)) await port.run(
      'UPDATE nodes SET content = ? WHERE id = ? AND body_blob_hash = ? AND sync_dirty = 0',
      [projection, row.id, row.body_blob_hash]);
    after = row.id;
  }
}
