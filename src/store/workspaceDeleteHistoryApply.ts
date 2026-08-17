import type { Node } from '../features/nodes/model/nodeTypes';

import type { WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import type { WorkspaceState } from './workspaceStore';

function isExactArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isExactIdSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function areParentSnapshotsApplicable(state: WorkspaceState, snapshots: Record<string, Node>) {
  return Object.entries(snapshots).every(([nodeId, snapshot]) => {
    const node = state.nodesById[nodeId];
    return node?.content === snapshot.content &&
      node?.updatedAt === snapshot.updatedAt &&
      JSON.stringify(node?.imageRegions ?? null) === JSON.stringify(snapshot.imageRegions ?? null);
  });
}

function isApplicable(state: WorkspaceState, entry: WorkspaceDeleteHistoryEntry, mode: 'redo' | 'undo') {
  const shouldBeTrashed = mode === 'undo';
  const parents = mode === 'undo' ? entry.afterParentNodesById : entry.beforeParentNodesById;
  const order = mode === 'undo' ? entry.afterNodeOrder : entry.beforeNodeOrder;
  const deletedAtById = mode === 'undo' ? entry.afterDeletedAtById : entry.beforeDeletedAtById;
  return isExactArray(state.nodeOrder, order) &&
    entry.nodeIds.every((nodeId) => Boolean(state.nodesById[nodeId]) &&
      state.trashedNodeIds.includes(nodeId) === shouldBeTrashed &&
      state.trashedNodeDeletedAtById[nodeId] === deletedAtById[nodeId]) &&
    areParentSnapshotsApplicable(state, parents);
}

function withMutationTimestamp(nodes: Record<string, Node>, updatedAt: string) {
  return Object.fromEntries(Object.entries(nodes).map(([nodeId, node]) => [nodeId, { ...node, updatedAt }]));
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
      ? await repository.syncRestoreNodes({ nodeIds: args.entry.nodeIds })
      : await repository.syncSoftDeleteNodes({ nodeIds: args.entry.nodeIds, deletedAt: args.mutationTimestamp });
  } catch {
    return 'failed' as const;
  }
  if (!result) return 'failed' as const;
  const exact = args.mode === 'undo'
    ? 'restoredNodeIds' in result && result.skippedConflicts.length === 0 &&
      isExactIdSet(result.restoredNodeIds, args.entry.nodeIds)
    : 'deletedNodeIds' in result && isExactIdSet(result.deletedNodeIds, args.entry.nodeIds);
  if (!exact) return 'invalid' as const;
  try {
    return await getWorkspaceHistoryPersistence().persistNodeSnapshots(args.parentNodes)
      ? 'applied' as const
      : 'invalid' as const;
  } catch {
    return 'invalid' as const;
  }
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
  if (mode === 'undo') return updatedEntry;
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
  const rawParents = args.mode === 'undo' ? args.entry.beforeParentNodesById : args.entry.afterParentNodesById;
  const parentNodesById = withMutationTimestamp(rawParents, args.mutationTimestamp);
  const persisted = await persistDeleteTransition({
    ...args,
    parentNodes: Object.values(parentNodesById)
  });
  if (persisted !== 'applied') return { status: persisted };
  const latest = args.get();
  if (!isApplicable(latest, args.entry, args.mode)) return { status: 'invalid' };
  const trashed = new Set(latest.trashedNodeIds);
  args.entry.nodeIds.forEach((nodeId) => args.mode === 'undo' ? trashed.delete(nodeId) : trashed.add(nodeId));
  const context = args.mode === 'undo' ? args.entry.beforeContext : args.entry.afterContext;
  const navigation = args.mode === 'undo' ? args.entry.beforeNavigation : args.entry.afterNavigation;
  const nodeOrder = args.mode === 'undo' ? args.entry.beforeNodeOrder : args.entry.afterNodeOrder;
  return appliedWorkspaceHistory(
    buildAppliedEntry(args.entry, args.mode, args.mutationTimestamp, parentNodesById),
    {
      ...applyWorkspaceHistoryContext(context),
      navigation: { backStack: [...navigation.backStack], forwardStack: [...navigation.forwardStack] },
      nodeOrder: [...nodeOrder],
      nodesById: { ...latest.nodesById, ...parentNodesById },
      trashedNodeDeletedAtById: applyDeletedAtSnapshots(latest, args.entry, args.mode, args.mutationTimestamp),
      trashedNodeIds: [...trashed]
    }
  );
}
