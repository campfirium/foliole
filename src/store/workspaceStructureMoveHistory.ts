import { buildMoveRuntimePayload, mergeMoveResult, moveResultMatchesRequest } from './workspaceMoveCommit';
import { confirmMoveReadingContent } from './workspaceMoveContentBarrier';
import { refreshMoveStructure } from './workspaceMoveRefresh';
import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import type { WorkspaceState } from './workspaceStore';
import type { WorkspaceStructureMoveEntry } from './workspaceStructureHistoryTypes';
import { restoreStructureParentOrders, structureParentOrdersMatch } from './workspaceStructureParentOrders';

export function isStructureMoveApplicable(
  state: WorkspaceState, entry: WorkspaceStructureMoveEntry, mode: 'redo' | 'undo'
) {
  const parents = mode === 'undo' ? entry.afterParentNodeIdByRoot : entry.beforeParentNodeIdByRoot;
  const orders = mode === 'undo' ? entry.afterParentOrders : entry.beforeParentOrders;
  return entry.rootNodeIds.every((id) => state.nodesById[id]?.parentNodeId === parents[id]) &&
    structureParentOrdersMatch(state, orders);
}

function buildRestorePatch(state: WorkspaceState, entry: WorkspaceStructureMoveEntry, mode: 'redo' | 'undo') {
  const parents = mode === 'undo' ? entry.beforeParentNodeIdByRoot : entry.afterParentNodeIdByRoot;
  const orders = mode === 'undo' ? entry.beforeParentOrders : entry.afterParentOrders;
  const timestamp = new Date().toISOString();
  const nodesById = { ...state.nodesById };
  entry.rootNodeIds.forEach((id) => {
    const node = nodesById[id];
    if (node) nodesById[id] = { ...node, parentNodeId: parents[id] ?? null, updatedAt: timestamp };
  });
  const nodeOrder = restoreStructureParentOrders({ nodeOrder: state.nodeOrder, nodesById }, orders);
  return { nodeOrder, nodesById };
}

export async function applyStructureMoveHistory(
  get: () => WorkspaceState, entry: WorkspaceStructureMoveEntry, mode: 'redo' | 'undo'
) {
  let before = get();
  if (!isStructureMoveApplicable(before, entry, mode)) return null;
  let patch = buildRestorePatch(before, entry, mode);
  const ready = confirmMoveReadingContent(before, patch.nodesById, entry.rootNodeIds);
  if (!(typeof ready === 'boolean' ? ready : await ready)) return null;
  before = get();
  if (!isStructureMoveApplicable(before, entry, mode)) return null;
  patch = buildRestorePatch(before, entry, mode);
  const payload = buildMoveRuntimePayload(before, patch, entry.rootNodeIds, true);
  const result = await getWorkspaceMutationRepository().syncMoveNodes(payload);
  if (!result || !moveResultMatchesRequest(payload, result)) {
    await refreshMoveStructure(before, payload);
    return null;
  }
  const merged = mergeMoveResult(before, get(), payload, result);
  if (merged) return merged;
  await refreshMoveStructure(before, payload);
  return {};
}
