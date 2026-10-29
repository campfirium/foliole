import type { Node } from '../features/nodes/model/nodeTypes';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import type { WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { restoreDeleteHistoryOrder, restoreDeleteManualOrders } from './workspaceDeleteHistoryOrder';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import type { WorkspaceState } from './workspaceStore';
import { createTrashParentUpdates } from './workspaceTrashRuntimeCommit';

function isExactIdSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function areParentSnapshotsApplicable(state: WorkspaceState, snapshots: Record<string, Node>) {
  return Object.entries(snapshots).every(([nodeId, snapshot]) => {
    const node = state.nodesById[nodeId];
    return node?.content === snapshot.content &&
      (node?.updatedAt === snapshot.updatedAt ||
        JSON.stringify(node?.manualChildOrder ?? null) !== JSON.stringify(snapshot.manualChildOrder ?? null)) &&
      JSON.stringify(node?.imageRegions ?? null) === JSON.stringify(snapshot.imageRegions ?? null);
  });
}

function isApplicable(state: WorkspaceState, entry: WorkspaceDeleteHistoryEntry, mode: 'redo' | 'undo') {
  const shouldBeTrashed = mode === 'undo';
  const parents = mode === 'undo' ? entry.afterParentNodesById : entry.beforeParentNodesById;
  const deletedAtById = mode === 'undo' ? entry.afterDeletedAtById : entry.beforeDeletedAtById;
  return entry.nodeIds.every((nodeId) => Boolean(state.nodesById[nodeId]) &&
      state.nodesById[nodeId]?.parentNodeId === entry.parentNodeIdById[nodeId] &&
      state.trashedNodeIds.includes(nodeId) === shouldBeTrashed &&
      state.trashedNodeDeletedAtById[nodeId] === deletedAtById[nodeId]) &&
    areParentSnapshotsApplicable(state, parents);
}

function withMutationTimestamp(nodes: Record<string, Node>, state: WorkspaceState, updatedAt: string) {
  return Object.fromEntries(Object.entries(nodes).map(([nodeId, node]) => {
    const parent = { ...state.nodesById[nodeId]!, updatedAt };
    if (node.imageRegions === undefined) delete parent.imageRegions;
    else parent.imageRegions = node.imageRegions;
    return [nodeId, parent];
  }));
}

async function persistDeleteTransition(args: {
  entry: WorkspaceDeleteHistoryEntry;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
  parentNodes: Node[];
}) {
  const repository = getWorkspaceMutationRepository();
  let result;
  try {
    result = args.mode === 'undo'
      ? await repository.syncRestoreNodes({ nodeIds: args.entry.nodeIds, parentOrders: args.entry.parentOrders,
        ...createTrashParentUpdates(args.parentNodes) })
      : await repository.syncSoftDeleteNodes({ nodeIds: args.entry.nodeIds, deletedAt: args.mutationTimestamp, ...createTrashParentUpdates(args.parentNodes) });
  } catch {
    return { status: 'failed' as const };
  }
  if (!result) return { status: 'failed' as const };
  const exact = args.mode === 'undo'
    ? 'restoredNodeIds' in result && result.skippedConflicts.length === 0 &&
      isExactIdSet(result.restoredNodeIds, args.entry.nodeIds)
    : 'deletedNodeIds' in result && isExactIdSet(result.deletedNodeIds, args.entry.nodeIds);
  if (!exact) return { status: 'invalid' as const };
  return { status: 'applied' as const, nodeOrder: 'nodeOrder' in result ? result.nodeOrder : undefined,
    manualParentOrders: 'manualParentOrders' in result ? result.manualParentOrders : undefined };
}

function applyDeletedAtSnapshots(
  state: WorkspaceState,
  entry: WorkspaceDeleteHistoryEntry,
  mode: 'redo' | 'undo',
  mutationTimestamp: string
) {
  const next = { ...state.trashedNodeDeletedAtById };
  const snapshots = mode === 'undo'
    ? entry.beforeDeletedAtById
    : Object.fromEntries(entry.nodeIds.map((nodeId) => [nodeId, mutationTimestamp]));
  for (const nodeId of entry.nodeIds) {
    const deletedAt = snapshots[nodeId];
    if (deletedAt === undefined) delete next[nodeId];
    else next[nodeId] = deletedAt;
  }
  return next;
}

function buildAppliedEntry(
  entry: WorkspaceDeleteHistoryEntry,
  mode: 'redo' | 'undo',
  mutationTimestamp: string,
  parentNodesById: Record<string, Node>
) {
  const updatedEntry = { ...entry, mutationTimestamp };
  if (mode === 'undo') return { ...updatedEntry, beforeParentNodesById: parentNodesById };
  return {
    ...updatedEntry,
    afterDeletedAtById: Object.fromEntries(entry.nodeIds.map((nodeId) => [nodeId, mutationTimestamp])),
    afterParentNodesById: parentNodesById
  };
}

export async function applyWorkspaceDeleteHistory(args: {
  entry: WorkspaceDeleteHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
}): Promise<WorkspaceHistoryApplyResult> {
  if (!isApplicable(args.get(), args.entry, args.mode)) return { status: 'invalid' };
  const manualBefore: Record<string, readonly string[] | null> = Object.fromEntries(args.entry.parentOrders.flatMap(order =>
    order.parentNodeId ? [[order.parentNodeId, args.get().nodesById[order.parentNodeId]?.manualChildOrder ?? null]] : []));
  const rawParents = args.mode === 'undo' ? args.entry.beforeParentNodesById : args.entry.afterParentNodesById;
  const parentNodesById = withMutationTimestamp(rawParents, args.get(), args.mutationTimestamp);
  const persisted = await persistDeleteTransition({
    ...args,
    parentNodes: Object.values(parentNodesById)
  });
  if (persisted.status !== 'applied') {
    showAppRuntimeNotice('Could not update Trash. Please try again.', 'error');
    return { status: persisted.status };
  }
  const latest = args.get();
  if (!isApplicable(latest, args.entry, args.mode)) return { status: 'invalid' };
  const trashed = new Set(latest.trashedNodeIds);
  args.entry.nodeIds.forEach((nodeId) => args.mode === 'undo' ? trashed.delete(nodeId) : trashed.add(nodeId));
  const context = args.mode === 'undo' ? args.entry.beforeContext : args.entry.afterContext;
  const navigation = args.mode === 'undo' ? args.entry.beforeNavigation : args.entry.afterNavigation;
  const nodeOrder = args.mode === 'undo'
    ? restoreDeleteHistoryOrder(latest, args.entry, persisted.nodeOrder) : latest.nodeOrder;
  const latestParents = withMutationTimestamp(rawParents, latest, args.mutationTimestamp);
  const restoredState = { ...latest, nodesById: { ...latest.nodesById, ...latestParents } };
  const nodesById = args.mode === 'undo'
    ? restoreDeleteManualOrders(restoredState, args.entry, args.mutationTimestamp, manualBefore, persisted.manualParentOrders)
    : restoredState.nodesById;
  const appliedParents = Object.fromEntries(Object.keys(parentNodesById).map(id => [id, nodesById[id]!]));
  return appliedWorkspaceHistory(
    buildAppliedEntry(args.entry, args.mode, args.mutationTimestamp, appliedParents),
    {
      ...applyWorkspaceHistoryContext(context),
      navigation: { backStack: [...navigation.backStack], forwardStack: [...navigation.forwardStack] },
      nodeOrder,
      nodesById,
      trashedNodeDeletedAtById: applyDeletedAtSnapshots(latest, args.entry, args.mode, args.mutationTimestamp),
      trashedNodeIds: [...trashed]
    }
  );
}
