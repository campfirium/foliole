import { sortManualFolderNodes } from '../../lib/core/nodes/manualFolderOrder';
import { restoreDeletedChildOrder } from '../../lib/core/nodes/restoreDeletedChildOrder';
import type { NativeRestoreNodesResult } from '../../lib/platform/nativeNodeMutationContract';

import type { WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import type { WorkspaceState } from './workspaceStore';
import { captureStructureParentOrders, restoreStructureParentOrders } from './workspaceStructureParentOrders';

export function restoreDeleteHistoryOrder(
  state: WorkspaceState, entry: WorkspaceDeleteHistoryEntry, committedOrder?: string[]
) {
  const targets = new Set(entry.nodeIds);
  const current = { ...state, nodeOrder: [...new Set([...state.nodeOrder, ...entry.nodeIds])] };
  const orders = captureStructureParentOrders(current, entry.parentOrders.map(order => order.parentNodeId));
  const restored = orders.map(order => {
    const saved = committedOrder
      ? committedOrder.filter(id => state.nodesById[id]?.parentNodeId === order.parentNodeId)
      : entry.parentOrders.find(saved => saved.parentNodeId === order.parentNodeId)!.childIds;
    return { ...order, childIds: restoreDeletedChildOrder(order.childIds, saved, targets) };
  });
  return restoreStructureParentOrders(current, restored);
}

export function restoreDeleteManualOrders(state: WorkspaceState, entry: WorkspaceDeleteHistoryEntry,
  updatedAt: string, before: Record<string, readonly string[] | null>, committed?: NativeRestoreNodesResult['manualParentOrders']) {
  const updates = committed ?? entry.parentOrders.flatMap(order => {
    const parent = order.parentNodeId ? state.nodesById[order.parentNodeId] : null;
    if (!parent?.manualChildOrder || !order.manualChildIds) return [];
    const current = sortManualFolderNodes(Object.values(state.nodesById).filter(node => node.parentNodeId === parent.id),
      parent.manualChildOrder).map(node => node.id);
    return [{ parentNodeId: parent.id, updatedAt,
      childIds: restoreDeletedChildOrder(current, order.manualChildIds, new Set(entry.nodeIds)) }];
  });
  const nodesById = { ...state.nodesById };
  for (const order of updates) {
    const parent = nodesById[order.parentNodeId];
    if (parent && JSON.stringify(parent.manualChildOrder ?? null) === JSON.stringify(before[parent.id] ?? null)) {
      nodesById[parent.id] = { ...parent, manualChildOrder: order.childIds, updatedAt: order.updatedAt };
    }
  }
  return nodesById;
}
