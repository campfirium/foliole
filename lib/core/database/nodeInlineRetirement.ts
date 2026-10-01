import { decodeTextBodyBlobData, hashTextBody } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import { projectNodeInlineContent } from './nodeInlineProjection.js';

export function inspectNodeInlineRetirement(driver: DatabaseDriver, id: string) {
  const row = driver.queryOne<{ content: string; body_blob_hash: string; data: unknown; kind: string | null; sync_dirty: number; editing: number }>(
    `SELECT n.content, n.body_blob_hash, data.data, b.kind, n.sync_dirty,
     EXISTS (SELECT 1 FROM node_version_local_holds WHERE object_id = n.id) AS editing FROM nodes n
     LEFT JOIN content_blob_data data ON data.hash = n.body_blob_hash
     LEFT JOIN content_blobs b ON b.hash = n.body_blob_hash WHERE n.id = ?`, [id]);
  if (!row?.body_blob_hash) return { status: 'unchanged' as const };
  const body = decodeTextBodyBlobData(row.data);
  if (row.kind !== 'text_body' || body === null || hashTextBody(body) !== row.body_blob_hash) {
    return { status: 'protected' as const, reason: 'body_blob_invalid_or_missing' };
  }
  const projection = projectNodeInlineContent(body);
  if (row.content === projection) return { status: 'unchanged' as const };
  if (row.content !== body && row.content !== '') return { status: 'protected' as const, reason: 'contradictory_inline_body' };
  if (row.sync_dirty) return { status: 'protected' as const, reason: 'node_dirty' };
  if (row.editing) return { status: 'protected' as const, reason: 'editor_active' };
  return { status: 'retire' as const, projection };
}

/** Retire inspected duplicates only; contradictory inline facts and active edits are preserved. */
export function retireDuplicateNodeInlineContent(driver: DatabaseDriver, nodeIds: readonly string[]) {
  return driver.transaction(() => {
    let changed = 0;
    const protectedNodeIds: string[] = [];
    for (const id of new Set(nodeIds)) {
      const inspection = inspectNodeInlineRetirement(driver, id);
      if (inspection.status === 'protected') protectedNodeIds.push(id);
      else if (inspection.status === 'retire') {
        changed += driver.execute('UPDATE nodes SET content = ? WHERE id = ?', [inspection.projection, id]).changes;
      }
    }
    return { changed, protectedNodeIds };
  });
}
