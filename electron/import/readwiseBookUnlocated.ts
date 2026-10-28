import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { rewriteParentChildOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { readParentChildOrder } from '../../lib/core/database/parentChildOrder.js';
import { buildReadwiseUnlocatedNodeId } from '../../lib/core/readwise/readwiseBookUnlocated.js';

export function ensureReadwiseUnlocatedNode(input: {
  connectionRef: string;
  documentId: string;
  driver: DatabaseDriver;
  importedAt: string;
  rootNodeId: string;
}) {
  const nodeId = buildReadwiseUnlocatedNodeId(input.connectionRef, input.documentId);
  const existing = input.driver.queryOne<{ created_at: string }>('SELECT created_at FROM nodes WHERE id = ?', [nodeId]);
  upsertNodeSnapshot(input.driver, {
    anchorLink: null,
    content: '# ※',
    createdAt: existing?.created_at ?? input.importedAt,
    hideTitleHeading: true,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    parentNodeId: input.rootNodeId,
    position: null,
    reveal: null,
    title: '※',
    updatedAt: input.importedAt
  }, {  });
  return nodeId;
}

export function removeEmptyReadwiseUnlocatedNode(driver: DatabaseDriver, nodeId: string, deletedAt: string) {
  const children = driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [nodeId]
  )?.count ?? 0;
  if (children === 0) {
    driver.execute('UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?', [deletedAt, deletedAt, nodeId]);
  }
}

export function placeReadwiseUnlocatedNodeLast(
  driver: DatabaseDriver,
  rootNodeId: string,
  nodeId: string
) {
  const { childIds, byId } = readParentChildOrder(driver, rootNodeId);
  const siblings = childIds.filter((id) => !byId.get(id)!.deleted_at);
  if (!siblings.includes(nodeId)) return;
  rewriteParentChildOrder(driver, rootNodeId, [...siblings.filter((id) => id !== nodeId), nodeId]);
}
