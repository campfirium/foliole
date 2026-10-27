import type { WorkspaceState } from './workspaceStore';
import type { WorkspaceStructureParentOrder } from './workspaceStructureHistoryTypes';

export function captureStructureParentOrders(state: WorkspaceState, parentIds: Array<string | null>) {
  return [...new Set(parentIds)].map((parentNodeId) => ({
    parentNodeId,
    childIds: state.nodeOrder.filter((id) => state.nodesById[id]?.parentNodeId === parentNodeId)
  }));
}

export function structureParentOrdersMatch(state: WorkspaceState, expected: WorkspaceStructureParentOrder[]) {
  return expected.every(({ parentNodeId, childIds }) => {
    const current = state.nodeOrder.filter((id) => state.nodesById[id]?.parentNodeId === parentNodeId);
    return current.length === childIds.length && current.every((id, index) => id === childIds[index]);
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
