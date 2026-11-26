import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { loadMirrorChildOrders } from './mirrorScopedTree.js';

/**
 * Library traversal positions of `nodeIds`, all below `anchorId` (`null` is the root), relative to each other.
 * Only parents where two of their paths split are read, so siblings off those paths are never loaded.
 */
export function orderScopedNodes(snapshot: WorkspaceSnapshot, anchorId: string | null, nodeIds: Iterable<string>) {
  const wanted = new Set(nodeIds);
  const childrenByParent = new Map<string | null, Set<string>>();
  for (const nodeId of wanted) {
    let childId = nodeId;
    for (;;) {
      const parentId = snapshot.nodesById[childId]?.parentNodeId;
      if (parentId === undefined) return null;
      const children = childrenByParent.get(parentId) ?? new Set<string>();
      children.add(childId);
      childrenByParent.set(parentId, children);
      if (parentId === anchorId) break;
      if (parentId === null) return null;
      childId = parentId;
    }
  }
  const branching = [...childrenByParent].filter(([, children]) => children.size > 1).map(([parentId]) => parentId);
  const orders = branching.length > 0 ? loadMirrorChildOrders(branching) : new Map<string | null, string[]>();
  const positions = new Map<string, number>();
  const visit = (parentId: string | null): boolean => {
    let children = [...childrenByParent.get(parentId) ?? []];
    if (children.length > 1) {
      const index = new Map((orders.get(parentId) ?? []).map((id, position) => [id, position]));
      if (children.some((id) => !index.has(id))) return false;
      children = children.sort((left, right) => index.get(left)! - index.get(right)!);
    }
    for (const childId of children) {
      if (wanted.has(childId)) positions.set(childId, positions.size);
      if (!visit(childId)) return false;
    }
    return true;
  };
  return visit(anchorId) ? positions : null;
}
