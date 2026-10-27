import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import type {
  WorkspaceStructureCreateEntry,
  WorkspaceStructureDeleteEntry,
  WorkspaceStructureHistoryEntry
} from './workspaceStructureHistoryTypes';
import { applyStructureMoveHistory, isStructureMoveApplicable } from './workspaceStructureMoveHistory';
import { applyWorkspaceStructureRenameHistory } from './workspaceStructureRenameHistoryApply';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';

function isExactIdSet(actual: string[], expected: string[]) {
  return actual.length === expected.length && actual.every((id) => expected.includes(id));
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

export function applyWorkspaceStructureHistory(args: {
  entry: WorkspaceStructureHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
}): Promise<Partial<WorkspaceState> | null> {
  if (args.entry.type === 'structure.rename') {
    return applyWorkspaceStructureRenameHistory(args.get, args.entry, args.mode);
  }
  if (args.entry.type === 'structure.move') return applyStructureMoveHistory(args.get, args.entry, args.mode);
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
    return isStructureMoveApplicable(state, entry, mode);
  }
  const restoring = (entry.type === 'structure.create') === (mode === 'redo');
  return isTrashSourceApplicable(state, entry.nodeIds, restoring);
}
