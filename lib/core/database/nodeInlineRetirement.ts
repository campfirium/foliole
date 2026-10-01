import { decodeTextBodyBlobData, hashTextBody } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import { projectNodeInlineContent } from './nodeInlineProjection.js';

/** Retire inspected duplicates only; contradictory inline facts are preserved. */
export function retireDuplicateNodeInlineContent(driver: DatabaseDriver, nodeIds: readonly string[]) {
  return driver.transaction(() => {
    let changed = 0;
    const protectedNodeIds: string[] = [];
    for (const id of new Set(nodeIds)) {
      const row = driver.queryOne<{ content: string; body_blob_hash: string; data: unknown }>(
        `SELECT n.content, n.body_blob_hash, data.data FROM nodes n
         LEFT JOIN content_blob_data data ON data.hash = n.body_blob_hash WHERE n.id = ?`, [id]);
      if (!row?.body_blob_hash) continue;
      const body = decodeTextBodyBlobData(row.data);
      if (body === null || hashTextBody(body) !== row.body_blob_hash) {
        protectedNodeIds.push(id);
        continue;
      }
      const projection = projectNodeInlineContent(body);
      if (row.content === projection) continue;
      if (row.content !== body && row.content !== '') {
        protectedNodeIds.push(id);
        continue;
      }
      changed += driver.execute('UPDATE nodes SET content = ? WHERE id = ?', [projection, id]).changes;
    }
    return { changed, protectedNodeIds };
  });
}
