import { moveOrderChildren, retainFixedRootSlots } from '../../lib/core/nodes/structureMoveOrder';
import type { NativeMoveNodesArgs, NativeMoveNodesResult } from '../../lib/platform/nativeMoveContract';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import type { WorkspaceState } from './workspaceStore';
import { restoreStructureParentOrders } from './workspaceStructureParentOrders';

export function buildMoveRuntimePayload(
  before: WorkspaceState, patch: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>,
  rootNodeIds: string[], maintainSequentialReading: boolean
): NativeMoveNodesArgs {
  const nodes = rootNodeIds.map((nodeId) => ({ nodeId,
    expectedParentNodeId: before.nodesById[nodeId]!.parentNodeId,
    parentNodeId: patch.nodesById[nodeId]!.parentNodeId,
    updatedAt: patch.nodesById[nodeId]!.updatedAt }));
  const parents = [...new Set(nodes.flatMap((node) => [node.expectedParentNodeId, node.parentNodeId]))];
  return { nodes, maintainSequentialReading,
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    parentOrders: parents.map((parentNodeId) => ({ parentNodeId,
      expectedChildIds: moveOrderChildren(parentNodeId,
        before.nodeOrder.filter((id) => before.nodesById[id]?.parentNodeId === parentNodeId)),
      childIds: moveOrderChildren(parentNodeId,
        patch.nodeOrder.filter((id) => patch.nodesById[id]?.parentNodeId === parentNodeId)) })) };
}

export function mergeMoveResult(
  before: WorkspaceState, latest: WorkspaceState, payload: NativeMoveNodesArgs, result: NativeMoveNodesResult
) {
  const same = (left: string[], right: string[]) => left.length === right.length && left.every((id, i) => id === right[i]);
  const applicable = result.parentOrders.every((order) => {
    const current = moveOrderChildren(order.parentNodeId,
      latest.nodeOrder.filter((id) => latest.nodesById[id]?.parentNodeId === order.parentNodeId));
    const expected = payload.parentOrders.find((parent) => parent.parentNodeId === order.parentNodeId);
    return expected && (same(current, expected.expectedChildIds) || same(current, order.childIds));
  }) && result.nodes.every((node) => {
    const parent = latest.nodesById[node.nodeId]?.parentNodeId;
    return parent === node.parentNodeId || parent === payload.nodes.find((root) => root.nodeId === node.nodeId)?.expectedParentNodeId;
  });
  if (!applicable) return null;
  const nodesById = { ...latest.nodesById };
  result.nodes.forEach((node) => {
    const current = nodesById[node.nodeId];
    if (current) nodesById[node.nodeId] = { ...current, parentNodeId: node.parentNodeId,
      updatedAt: current.updatedAt === before.nodesById[node.nodeId]?.updatedAt ? node.updatedAt : current.updatedAt };
  });
  result.readings.forEach(({ nodeId, reading }) => {
    const current = nodesById[nodeId];
    if (current && current.reading === before.nodesById[nodeId]?.reading) nodesById[nodeId] = { ...current, reading };
  });
  const orders = result.parentOrders.map((order) => order.parentNodeId === null ? { ...order,
    childIds: retainFixedRootSlots(latest.nodeOrder.filter((id) => nodesById[id]?.parentNodeId === null), order.childIds) } : order);
  return { nodesById, nodeOrder: restoreStructureParentOrders({ nodeOrder: latest.nodeOrder, nodesById }, orders) };
}

export function moveResultMatchesRequest(payload: NativeMoveNodesArgs, result: NativeMoveNodesResult) {
  const sameSet = (left: string[], right: string[]) => left.length === right.length &&
    new Set(left).size === left.length && left.every((id) => right.includes(id));
  const roots = payload.nodes.map((node) => node.nodeId);
  return sameSet(result.movedNodeIds, roots) && sameSet(result.nodes.map((node) => node.nodeId), roots) &&
    result.nodes.every((node) => payload.nodes.some((root) =>
      root.nodeId === node.nodeId && root.parentNodeId === node.parentNodeId)) &&
    result.parentOrders.length === payload.parentOrders.length &&
    new Set(result.parentOrders.map((order) => order.parentNodeId)).size === payload.parentOrders.length &&
    result.parentOrders.every((order) => {
      const expected = payload.parentOrders.find((parent) => parent.parentNodeId === order.parentNodeId);
      return expected && sameSet(order.childIds, expected.childIds);
    });
}
