import { deriveScopedVisibleNodeOrder, loadParentOrderSourcesWithDbPort } from '../../../../../lib/core/database/parentChildOrder';
import { workspaceMetadataOrderParents } from '../../../../../lib/core/database/workspaceContentProjection';
import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

/**
 * The visible order once a metadata write lands, derived before it is written: these writes keep every parent's
 * order sources, so only the parents they move nodes out of or into are ordered again. Sequential Reading must
 * plan from this order, as the desktop does, or a moved topic keeps its old place ahead of the source's topics.
 */
export async function deriveCompanionWriteNodeOrder(db: DbPort, snapshot: WorkspaceSnapshot,
  after: WorkspaceSnapshot['nodesById']) {
  const changed = Object.fromEntries(Object.entries(after).filter(([id, node]) => snapshot.nodesById[id] !== node));
  const parents = workspaceMetadataOrderParents(snapshot, after, changed);
  if (!parents.size) return snapshot.nodeOrder;
  return deriveScopedVisibleNodeOrder(Object.values(after).map(node => ({ id: node.id, parent_id: node.parentNodeId,
    title: node.title, created_at: node.createdAt, deleted_at: node.deletedAt ?? null })),
  snapshot.nodeOrder, parents, await loadParentOrderSourcesWithDbPort(db, [...parents]));
}
