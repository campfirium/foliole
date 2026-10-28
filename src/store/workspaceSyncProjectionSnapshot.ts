import type { WorkspaceListProjection } from '../../lib/core/database/workspaceListProjection';
import { applyResolvedOpenings } from '../../lib/core/database/workspaceListSnapshotOpening';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { recordWorkspaceRecordPatch } from '../shared/workspaceRecordPatch';

import type { WorkspaceState } from './workspaceStoreTypes';

function needsMembershipNormalization(current: WorkspaceState, nodes: Record<string, Node>, ids: readonly string[]) {
  return ids.some(id => {
    const before = current.nodesById[id];
    const after = nodes[id];
    return !before || !after || before.parentNodeId !== after.parentNodeId || before.deletedAt !== after.deletedAt;
  });
}

export function resolveSyncProjectionSnapshot(current: WorkspaceState, projection: WorkspaceListProjection,
  nodesById: Record<string, Node>, nodeOrder: string[], changedIds: readonly string[]) {
  const structural = Boolean(projection.structure) || needsMembershipNormalization(current, nodesById, changedIds);
  const changed = new Set(changedIds);
  const targetIds = structural ? Object.keys(nodesById) : nodeOrder.filter(id => changed.has(id) && nodesById[id]);
  const originals = new Map(targetIds.map(id => [id, nodesById[id]!]));
  const directOpenings = new Map(Object.entries(projection.directOpeningById).map(([id, opening]) =>
    [id, nodesById[id] !== current.nodesById[id] ? opening : nodesById[id]?.openingText ?? null]));
  // Only selected nodes are mutated by opening resolution; keep the published baseline immutable.
  for (const id of targetIds) nodesById[id] = { ...nodesById[id]! };
  applyResolvedOpenings({ directOpeningById: new Map(), nodeOrder, nodesById, pdfOpeningById: new Map(),
    targetNodeIds: structural ? nodeOrder : targetIds,
    readDirectOpening: id => directOpenings.has(id)
      ? directOpenings.get(id) ?? null : nodesById[id]?.openingText ?? null });
  for (const id of targetIds) {
    const original = originals.get(id);
    if (original && nodesById[id]?.openingText === original.openingText) {
      nodesById[id] = original;
    }
  }
  if (structural) return normalizeWorkspaceSnapshot({ activeNodeId: current.activeNodeId,
    nodeOrder, nodesById, trashedNodeIds: [], trashedNodeDeletedAtById: {} });
  return { activeNodeId: current.activeNodeId, nodeOrder,
    nodesById: recordWorkspaceRecordPatch(current.nodesById, nodesById, changedIds),
    trashedNodeIds: current.trashedNodeIds, trashedNodeDeletedAtById: current.trashedNodeDeletedAtById };
}
