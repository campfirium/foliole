import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { loadDerivedNodeOrder, readOrderMembers } from '../../lib/core/database/parentChildOrder.js';
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
  });
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
  const activeSiblingIds = new Set(readOrderMembers(driver)
    .filter((node) => node.parent_id === rootNodeId && !node.deleted_at).map((node) => node.id));
  const siblings = loadDerivedNodeOrder(driver).filter((id) => activeSiblingIds.has(id));
  if (!siblings.includes(nodeId)) return;
  const siblingIds = new Set(siblings);
  const current = loadDerivedNodeOrder(driver);
  const firstSiblingIndex = current.findIndex((currentId) => siblingIds.has(currentId));
  const next = current.filter((currentId) => !siblingIds.has(currentId));
  const desired = [...siblings.filter((siblingId) => siblingId !== nodeId), nodeId];
  next.splice(firstSiblingIndex < 0 ? next.length : firstSiblingIndex, 0, ...desired);
  rewriteExistingNodeOrder(driver, next);
}
