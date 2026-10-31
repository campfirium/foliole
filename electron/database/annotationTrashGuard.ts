import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { captureAnnotationHistoryFact, hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts.js';
import type { NativeAnnotationTrashGuard } from '../../lib/platform/nativeTrashCommandMap.js';

import { openDatabaseConnection } from './connection.js';

/** Called inside the same transaction that performs the Trash transition. */
export function checkAnnotationTrashGuard(nodeIds: string[], guard: NativeAnnotationTrashGuard | undefined, parentUpdateIds: string[] = []) {
  if (!guard) return undefined;
  const driver = openDatabaseConnection().driver;
  if (parentUpdateIds.some(id => !guard.parents.some(parent => parent.nodeId === id))) throw new Error('annotation_history_changed');
  const members = new Set(nodeIds);
  if (!nodeIds.length || members.size !== nodeIds.length) throw new Error('annotation_history_changed');
  const facts = nodeIds.map(nodeId => {
    const row = driver.queryOne<{ id: string; parent_id: string | null; kind: string; content: string;
      reveal: string | null; anchor_link: string | null; image_regions: string | null; deleted_at: string | null }>(
      `SELECT n.id, n.parent_id, n.kind, ${buildNodeBodyContentSql()} AS content, n.reveal,
        n.anchor_link, n.image_regions, n.deleted_at FROM nodes n
        LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`, [nodeId]);
    if (!row || row.deleted_at !== guard.expectedDeletedAt) throw new Error('annotation_history_changed');
    const children = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [nodeId]);
    if (children.some(child => !members.has(child.id))) throw new Error('annotation_history_changed');
    return captureAnnotationHistoryFact({ ...row, parentNodeId: row.parent_id,
      anchorLink: row.anchor_link ? JSON.parse(row.anchor_link) : null,
      imageRegions: row.image_regions ? JSON.parse(row.image_regions) : null });
  });
  if (guard.mode === 'replay') {
    const expected = new Map(guard.nodes.map(fact => [fact.nodeId, fact]));
    if (guard.nodes.length !== members.size || expected.size !== members.size || facts.some(fact => hashAnnotationValue(fact) !== hashAnnotationValue(expected.get(fact.nodeId)))) {
      throw new Error('annotation_history_changed');
    }
  }
  for (const parent of guard.parents) {
    const row = driver.queryOne<{ image_regions: string | null }>(
      'SELECT image_regions FROM nodes WHERE id = ? AND deleted_at IS NULL', [parent.nodeId]);
    if (!row || hashAnnotationValue(row.image_regions ? JSON.parse(row.image_regions) : null) !== parent.imageRegionsHash) {
      throw new Error('annotation_history_changed');
    }
  }
  return { nodes: facts, deletedAt: guard.expectedDeletedAt };
}
