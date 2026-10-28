import type { WorkspaceState } from './workspaceStore';
import type { WorkspaceStructureParentOrder } from './workspaceStructureHistoryTypes';

export function captureStructureParentOrders(state: WorkspaceState, parentIds: Array<string | null>) {
  const orders = new Map<string | null, string[]>();
  parentIds.forEach((id) => { if (!orders.has(id)) orders.set(id, []); });
  if (orders.size > 0) {
    for (const id of state.nodeOrder) {
      const parentNodeId = state.nodesById[id]?.parentNodeId;
      if (parentNodeId !== undefined) orders.get(parentNodeId)?.push(id);
    }
  }
  return [...orders].map(([parentNodeId, childIds]) => ({ parentNodeId, childIds }));
}

export function structureParentOrdersMatch(state: WorkspaceState, expected: WorkspaceStructureParentOrder[]) {
  const current = captureStructureParentOrders(state, expected.map(({ parentNodeId }) => parentNodeId));
  const byParent = new Map(current.map(({ parentNodeId, childIds }) => [parentNodeId, childIds]));
  return expected.every(({ parentNodeId, childIds }) => {
    const ids = byParent.get(parentNodeId)!;
    return ids.length === childIds.length && ids.every((id, index) => id === childIds[index]);
  });
}

/** Rebuild the derived traversal while replacing only the recorded direct sibling sequences. */
export function restoreStructureParentOrders(
  state: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>,
  orders: WorkspaceStructureParentOrder[]
) {
  const children = new Map<string | null, string[]>();
  for (const id of state.nodeOrder) {
    const node = state.nodesById[id];
    if (!node) continue;
    const siblings = children.get(node.parentNodeId) ?? [];
    siblings.push(id);
    children.set(node.parentNodeId, siblings);
  }
  orders.forEach(({ parentNodeId, childIds }) => children.set(parentNodeId, childIds));
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id) || !state.nodesById[id]) return;
    visited.add(id);
    result.push(id);
    children.get(id)?.forEach(visit);
  };
  children.get(null)?.forEach(visit);
  state.nodeOrder.forEach(visit);
  return result;
}
