import type { NativeWorkspaceSnapshot } from '../../lib/platform/nativeStorageContract';
import {
  mergePendingReadingProgress,
  readPendingNodeOrder,
  readPendingRelearnNodes,
  reconcilePendingNodeOrder
} from '../shared/platform/workspacePendingDurableMutations';
import {
  replayPendingWorkspaceDurableMutations,
  replayPendingWorkspaceNodeSync
} from '../shared/platform/workspaceRuntimeRepository';

import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';

function isAvailableNode(snapshot: NativeWorkspaceSnapshot, nodeId: string) {
  return Boolean(snapshot.nodesById[nodeId]) && !snapshot.trashedNodeIds.includes(nodeId);
}

function reconcileNodeOrder(snapshot: NativeWorkspaceSnapshot) {
  const pending = readPendingNodeOrder();
  if (!pending) return snapshot.nodeOrder;
  const pendingNodeIds = listPendingNodeSyncNodeIds();
  const eligible = new Set([
    ...snapshot.nodeOrder.filter((nodeId) => isAvailableNode(snapshot, nodeId)),
    ...pendingNodeIds.filter((nodeId) => isAvailableNode(snapshot, nodeId))
  ]);
  const reconciled: string[] = [];
  const append = (nodeId: string) => {
    if (eligible.has(nodeId) && !reconciled.includes(nodeId)) reconciled.push(nodeId);
  };
  pending.payload.forEach(append);
  snapshot.nodeOrder.forEach(append);
  pendingNodeIds.forEach(append);
  reconcilePendingNodeOrder(reconciled);
  return reconciled;
}

function mergePendingRelearn(snapshot: NativeWorkspaceSnapshot) {
  const entries = readPendingRelearnNodes();
  if (entries.length === 0) return snapshot.nodesById;
  const nodesById = { ...snapshot.nodesById };
  for (const entry of entries) {
    const node = nodesById[entry.payload.nodeId];
    if (node) nodesById[entry.payload.nodeId] = { ...node, review: null };
  }
  return nodesById;
}

export function mergePendingDurableWorkspaceSnapshot(snapshot: NativeWorkspaceSnapshot) {
  return {
    ...snapshot,
    nodeOrder: reconcileNodeOrder(snapshot),
    nodesById: mergePendingRelearn(snapshot)
  };
}

export const mergePendingDurableReadingProgress = mergePendingReadingProgress;

export async function replayPendingWorkspaceMutations() {
  await replayPendingWorkspaceNodeSync();
  await replayPendingWorkspaceDurableMutations();
}
