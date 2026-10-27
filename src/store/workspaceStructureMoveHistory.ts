import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import type { WorkspaceState } from './workspaceStore';
import { applySequentialReadingMovedNodes } from './workspaceStoreTreeSequentialReading';
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
  return applySequentialReadingMovedNodes({ patch: { nodeOrder, nodesById },
    rootNodeIds: entry.rootNodeIds, state }).patch;
}

function mergeRestorePatch(
  before: WorkspaceState, latest: WorkspaceState, patch: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>,
  entry: WorkspaceStructureMoveEntry, mode: 'redo' | 'undo'
) {
  const nodesById = { ...latest.nodesById };
  for (const [id, next] of Object.entries(patch.nodesById)) {
    const previous = before.nodesById[id];
    const current = latest.nodesById[id];
    if (previous === next || !previous || !current) continue;
    const updates: Partial<typeof current> = {};
    for (const key of ['parentNodeId', 'reading', 'sequentialReadingEnabled', 'updatedAt'] as const) {
      if (next[key] !== previous[key] && current[key] === previous[key]) {
        Object.assign(updates, { [key]: next[key] });
      }
    }
    nodesById[id] = { ...current, ...updates };
  }
  const orders = mode === 'undo' ? entry.beforeParentOrders : entry.afterParentOrders;
  return { nodeOrder: restoreStructureParentOrders({ nodeOrder: latest.nodeOrder, nodesById }, orders), nodesById };
}

export async function applyStructureMoveHistory(
  get: () => WorkspaceState, entry: WorkspaceStructureMoveEntry, mode: 'redo' | 'undo'
) {
  const before = get();
  if (!isStructureMoveApplicable(before, entry, mode)) return null;
  const patch = buildRestorePatch(before, entry, mode);
  const syncNodeIds = [...new Set([...entry.rootNodeIds, ...Object.keys(patch.nodesById).filter(
    (id) => patch.nodesById[id] !== before.nodesById[id]
  )])];
  const payload = {
    nodeOrder: patch.nodeOrder,
    nodes: syncNodeIds.map((id) => patch.nodesById[id])
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
  if (!result || result.movedNodeIds.length !== syncNodeIds.length ||
      !result.movedNodeIds.every((id) => syncNodeIds.includes(id)) ||
      result.nodeOrder.join('\0') !== patch.nodeOrder.join('\0') ||
      !isStructureMoveApplicable(latest, entry, mode)) return null;
  return mergeRestorePatch(before, latest, patch, entry, mode);
}
