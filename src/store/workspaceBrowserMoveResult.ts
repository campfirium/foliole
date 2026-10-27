import { retainFixedRootSlots } from '../../lib/core/nodes/structureMoveOrder';
import { buildSequentialReadingMaintenancePatch } from '../../lib/core/review/sequentialReadingMaintenance';
import type { NativeMoveNodesArgs, NativeMoveNodesResult } from '../../lib/platform/nativeMoveContract';

import type { WorkspaceState } from './workspaceStore';
import { restoreStructureParentOrders } from './workspaceStructureParentOrders';

/** The Demo coordinates the same reading rules against its current in-memory facts. */
export function buildBrowserMoveResult(state: WorkspaceState, input: NativeMoveNodesArgs): NativeMoveNodesResult {
  const nodesById = { ...state.nodesById };
  for (const node of input.nodes) {
    const current = nodesById[node.nodeId];
    if (current) nodesById[node.nodeId] = { ...current, parentNodeId: node.parentNodeId, updatedAt: node.updatedAt };
  }
  const orders = input.parentOrders.map((order) => order.parentNodeId === null ? { ...order,
    childIds: retainFixedRootSlots(state.nodeOrder.filter((id) => nodesById[id]?.parentNodeId === null), order.childIds) } : order);
  const nodeOrder = restoreStructureParentOrders({ nodeOrder: state.nodeOrder, nodesById }, orders);
  const patch = input.maintainSequentialReading ? buildSequentialReadingMaintenancePatch({
    nodesById, nodeOrder, previousNodesById: state.nodesById,
    changedRootNodeIds: input.nodes.map((node) => node.nodeId),
    now: new Date().toISOString(), defaultPriority: input.defaultPriority
  }) : null;
  return {
    movedNodeIds: input.nodes.map((node) => node.nodeId),
    nodes: input.nodes.map(({ nodeId, parentNodeId, updatedAt }) => ({ nodeId, parentNodeId, updatedAt })),
    parentOrders: input.parentOrders.map(({ parentNodeId, childIds }) => ({ parentNodeId, childIds })),
    readings: (patch?.changes ?? []).map(({ nodeId, afterReading }) => ({ nodeId, reading: afterReading }))
  };
}
