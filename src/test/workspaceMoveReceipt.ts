import type { NativeMoveNodesArgs, NativeMoveNodesResult } from '../../lib/platform/nativeMoveContract.js';

/** Unit-test bridge fixture only; persistence contracts use the production SQLite command. */
export function workspaceMoveReceipt(payload: NativeMoveNodesArgs): NativeMoveNodesResult {
  return {
    movedNodeIds: payload.nodes.map((node) => node.nodeId),
    nodes: payload.nodes.map(({ nodeId, parentNodeId, updatedAt }) => ({ nodeId, parentNodeId, updatedAt })),
    parentOrders: payload.parentOrders.map(({ parentNodeId, childIds }) => ({ parentNodeId, childIds })),
    readings: []
  };
}
