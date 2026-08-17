import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { applySequentialReadingMovedNodes } from './workspaceStoreTreeSequentialReading';
import { captureStructurePlacement } from './workspaceStructureHistoryEntries';
import type {
  WorkspaceStructureCreateEntry,
  WorkspaceStructureDeleteEntry,
  WorkspaceStructureHistoryEntry,
  WorkspaceStructureMoveEntry,
  WorkspaceStructurePlacement
} from './workspaceStructureHistoryTypes';
import { applyWorkspaceStructureRenameHistory } from './workspaceStructureRenameHistoryApply';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';

function isExactIdSet(actual: string[], expected: string[]) {
  return actual.length === expected.length && actual.every((id) => expected.includes(id));
}

function samePlacement(left: WorkspaceStructurePlacement, right: WorkspaceStructurePlacement) {
  return left.nextNodeId === right.nextNodeId && left.previousNodeId === right.previousNodeId;
}

function isTrashSourceApplicable(state: WorkspaceState, nodeIds: string[], trashed: boolean) {
  return nodeIds.every((nodeId) => Boolean(state.nodesById[nodeId]) && state.trashedNodeIds.includes(nodeId) === trashed);
}

function buildRestorePatch(
  state: WorkspaceState,
  entry: WorkspaceStructureCreateEntry | WorkspaceStructureDeleteEntry,
  activeNodeId: string | null
) {
  const restored = new Set(entry.nodeIds);
  const trashedNodeDeletedAtById = { ...state.trashedNodeDeletedAtById };
  entry.nodeIds.forEach((nodeId) => delete trashedNodeDeletedAtById[nodeId]);
  const nextActiveNodeId = state.activeNodeId === activeNodeId ? entry.rootNodeId : state.activeNodeId;
  const nextState = {
    ...state,
    activeNodeId: nextActiveNodeId,
    trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds.filter((nodeId) => !restored.has(nodeId))
  };
  return {
    activeNodeId: nextActiveNodeId,
    reviewSession: reconcileReviewSession(nextState, nextActiveNodeId),
    trashedNodeDeletedAtById,
    trashedNodeIds: nextState.trashedNodeIds
  };
}

async function applyTrashTransition(args: {
  entry: WorkspaceStructureCreateEntry | WorkspaceStructureDeleteEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
}) {
  const restoring = (args.entry.type === 'structure.create') === (args.mode === 'redo');
  const sourceTrashed = restoring;
  const before = args.get();
  if (!isTrashSourceApplicable(before, args.entry.nodeIds, sourceTrashed)) return null;
  if (restoring) {
    const result = await getWorkspaceMutationRepository().syncRestoreNodes({ nodeIds: args.entry.nodeIds });
    const latest = args.get();
    if (!result || result.skippedConflicts.length > 0 ||
        !isExactIdSet(result.restoredNodeIds, args.entry.nodeIds) ||
        !isTrashSourceApplicable(latest, args.entry.nodeIds, true)) return null;
    const expectedActive = args.entry.type === 'structure.create'
      ? args.entry.beforeActiveNodeId : args.entry.afterActiveNodeId;
    const patch = buildRestorePatch(latest, args.entry, expectedActive);
    return args.entry.type === 'structure.create'
      ? { ...patch, ...applyWorkspaceHistoryContext(args.entry.afterContext) }
      : patch;
  }
  const deletedAt = new Date().toISOString();
  const mutation = computeDeleteNodesMutation(before, args.entry.nodeIds, deletedAt);
  if (!mutation || !isExactIdSet(mutation.nodeIds, args.entry.nodeIds)) return null;
  const result = await getWorkspaceMutationRepository().syncSoftDeleteNodes({
    deletedAt,
    nodeIds: args.entry.nodeIds
  });
  const latest = args.get();
  if (!result || !isExactIdSet(result.deletedNodeIds, args.entry.nodeIds) ||
      !isTrashSourceApplicable(latest, args.entry.nodeIds, false)) return null;
  const currentMutation = computeDeleteNodesMutation(latest, args.entry.nodeIds, deletedAt);
  if (!currentMutation || !isExactIdSet(currentMutation.nodeIds, args.entry.nodeIds)) return null;
  return args.entry.type === 'structure.create'
    ? { ...currentMutation.patch, ...applyWorkspaceHistoryContext(args.entry.beforeContext) }
    : currentMutation.patch;
}

function areMoveParentsApplicable(
  state: WorkspaceState,
  entry: WorkspaceStructureMoveEntry,
  parents: Record<string, string | null>,
  placement: WorkspaceStructurePlacement
) {
  return entry.rootNodeIds.every((nodeId) => state.nodesById[nodeId]?.parentNodeId === parents[nodeId]) &&
    samePlacement(captureStructurePlacement(state.nodeOrder, entry.movedNodeIds), placement);
}

function rebuildMovedOrder(
  currentOrder: string[],
  movedNodeIds: string[],
  placement: WorkspaceStructurePlacement
) {
  const moved = new Set(movedNodeIds);
  const remaining = currentOrder.filter((nodeId) => !moved.has(nodeId));
  let index = 0;
  if (placement.nextNodeId && remaining.includes(placement.nextNodeId)) {
    index = remaining.indexOf(placement.nextNodeId);
  } else if (placement.previousNodeId && remaining.includes(placement.previousNodeId)) {
    index = remaining.indexOf(placement.previousNodeId) + 1;
  } else if (placement.previousNodeId) {
    return null;
  }
  return [...remaining.slice(0, index), ...movedNodeIds, ...remaining.slice(index)];
}

async function applyMove(
  get: () => WorkspaceState,
  entry: WorkspaceStructureMoveEntry,
  mode: 'redo' | 'undo'
) {
  const sourceParents = mode === 'undo' ? entry.afterParentNodeIdByRoot : entry.beforeParentNodeIdByRoot;
  const sourcePlacement = mode === 'undo' ? entry.afterPlacement : entry.beforePlacement;
  const targetParents = mode === 'undo' ? entry.beforeParentNodeIdByRoot : entry.afterParentNodeIdByRoot;
  const targetPlacement = mode === 'undo' ? entry.beforePlacement : entry.afterPlacement;
  const before = get();
  if (!areMoveParentsApplicable(before, entry, sourceParents, sourcePlacement)) return null;
  const nodeOrder = rebuildMovedOrder(before.nodeOrder, entry.movedNodeIds, targetPlacement);
  if (!nodeOrder) return null;
  const timestamp = new Date().toISOString();
  const nodesById = { ...before.nodesById };
  entry.rootNodeIds.forEach((nodeId) => {
    const node = nodesById[nodeId];
    if (node) nodesById[nodeId] = { ...node, parentNodeId: targetParents[nodeId] ?? null, updatedAt: timestamp };
  });
  const sequential = applySequentialReadingMovedNodes({
    patch: { nodeOrder, nodesById },
    rootNodeIds: entry.rootNodeIds,
    state: before
  });
  const syncNodeIds = [...new Set([...entry.rootNodeIds, ...Object.keys(sequential.patch.nodesById).filter(
    (nodeId) => sequential.patch.nodesById[nodeId] !== before.nodesById[nodeId]
  )])];
  const payload = {
    nodeOrder,
    nodes: syncNodeIds.map((nodeId) => sequential.patch.nodesById[nodeId])
      .filter((node): node is WorkspaceState['nodesById'][string] => Boolean(node)).map((node) => ({
      nodeId: node.id,
      parentNodeId: node.parentNodeId,
      reading: node.reading ?? null,
      sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
      updatedAt: node.updatedAt
    }))
  };
  const result = await getWorkspaceMutationRepository().syncMoveNodes(payload);
  const latest = get();
  if (!result || !isExactIdSet(result.movedNodeIds, syncNodeIds) ||
      result.nodeOrder.join('\0') !== nodeOrder.join('\0') ||
      !areMoveParentsApplicable(latest, entry, sourceParents, sourcePlacement)) return null;
  return sequential.patch;
}

export function applyWorkspaceStructureHistory(args: {
  entry: WorkspaceStructureHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
}): Promise<Partial<WorkspaceState> | null> {
  if (args.entry.type === 'structure.rename') {
    return applyWorkspaceStructureRenameHistory(args.get, args.entry, args.mode);
  }
  if (args.entry.type === 'structure.move') return applyMove(args.get, args.entry, args.mode);
  if (args.entry.type === 'structure.create' || args.entry.type === 'structure.delete') {
    return applyTrashTransition({ entry: args.entry, get: args.get, mode: args.mode });
  }
  return Promise.resolve(null);
}

export function isWorkspaceStructureHistoryApplicable(
  state: WorkspaceState,
  entry: WorkspaceStructureHistoryEntry,
  mode: 'redo' | 'undo'
) {
  if (entry.type === 'structure.rename') {
    const node = state.nodesById[entry.nodeId];
    const title = mode === 'undo' ? entry.afterTitle : entry.beforeTitle;
    return Boolean(node && node.kind === entry.kind && node.title === title);
  }
  if (entry.type === 'structure.move') {
    return areMoveParentsApplicable(
      state,
      entry,
      mode === 'undo' ? entry.afterParentNodeIdByRoot : entry.beforeParentNodeIdByRoot,
      mode === 'undo' ? entry.afterPlacement : entry.beforePlacement
    );
  }
  const restoring = (entry.type === 'structure.create') === (mode === 'redo');
  return isTrashSourceApplicable(state, entry.nodeIds, restoring);
}
