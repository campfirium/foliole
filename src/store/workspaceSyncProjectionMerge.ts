import type { WorkspaceListProjection } from '../../lib/core/database/workspaceListProjection';
import { applyResolvedOpenings } from '../../lib/core/database/workspaceListSnapshotOpening';
import { normalizeWorkspaceSnapshot, resolveWorkspaceSnapshotActiveNodeId } from '../../lib/core/database/workspaceSnapshotContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { readPendingNodeOrder, readPendingRelearnNodes } from '../shared/platform/workspacePendingDurableMutations';

import { mergeHydratedNode, mergeNodeOpenStateById } from './workspaceHydrateObjectMerge';
import { hasUnconfirmedNodeContent } from './workspaceNodeContentVersionGuard';
import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';
import { parsePersistedWorkspaceState } from './workspacePersistedStateParser';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStoreTypes';

export function projectionChangesStructure(current: WorkspaceState, projection: WorkspaceListProjection) {
  if (projection.requestedNodeIds.some(id => current.nodesById[id] && !projection.nodesById[id])) return true;
  return Object.entries(projection.nodesById).some(([id, node]) => {
    const previous = current.nodesById[id];
    return !previous || previous.parentNodeId !== node.parentNodeId || previous.kind !== node.kind || previous.createdAt !== node.createdAt
      || previous.deletedAt !== node.deletedAt;
  });
}

function commitChanged(current: Node | undefined, baseline: Node | undefined) {
  return current?.currentVersionId !== baseline?.currentVersionId || current?.updatedAt !== baseline?.updatedAt
    || current?.createdAt !== baseline?.createdAt || current?.parentNodeId !== baseline?.parentNodeId
    || current?.deletedAt !== baseline?.deletedAt;
}

export function mergeWorkspaceSyncProjection(
  current: WorkspaceState, projection: WorkspaceListProjection, baseline = current
) {
  const nodesById = { ...current.nodesById };
  const incoming = parsePersistedWorkspaceState({ nodesById: projection.nodesById }).nodesById ?? {};
  const pending = new Set(listPendingNodeSyncNodeIds());
  for (const [id, node] of Object.entries(incoming)) {
    const previous = current.nodesById[id];
    const committedVersionChanged = !commitChanged(previous, baseline.nodesById[id])
      && previous?.currentVersionId !== node.currentVersionId && !pending.has(id) && !hasUnconfirmedNodeContent(id);
    const guarded = mergeHydratedNode(previous, node);
    const merged = committedVersionChanged
      ? { ...node, reading: guarded.reading ?? null, review: guarded.review ?? null }
      : pending.has(id) && previous ? previous : guarded;
    nodesById[id] = { ...merged,
      ...(node.reading === null && previous?.reading === baseline.nodesById[id]?.reading ? { reading: null } : {}),
      ...(node.review === null && previous?.review === baseline.nodesById[id]?.review ? { review: null } : {}) };
  }
  for (const { payload } of readPendingRelearnNodes()) {
    const node = nodesById[payload.nodeId];
    if (node) nodesById[payload.nodeId] = { ...node, review: null };
  }
  const members = projection.structure ? new Set(projection.structure.memberIds) : null;
  for (const id of members ? Object.keys(nodesById) : projection.requestedNodeIds) {
    if ((members ? !members.has(id) : !projection.nodesById[id]) && !hasUnconfirmedNodeContent(id) && !pending.has(id)
        && !commitChanged(current.nodesById[id], baseline.nodesById[id])) delete nodesById[id];
  }
  const orderChanged = current.nodeOrder.length !== baseline.nodeOrder.length
    || current.nodeOrder.some((id, index) => id !== baseline.nodeOrder[index]);
  const nodeOrder = readPendingNodeOrder() || orderChanged
    ? current.nodeOrder : projection.structure?.nodeOrder ?? current.nodeOrder;
  const directOpeningById = new Map(Object.entries(nodesById).map(([id, node]) => [id,
    id in projection.directOpeningById && nodesById[id] !== current.nodesById[id]
      ? projection.directOpeningById[id] ?? null : node.openingText ?? null]));
  // Opening resolution mutates nodes; never mutate the published baseline.
  const openingNodes = Object.fromEntries(Object.entries(nodesById).map(([id, node]) => [id, { ...node }]));
  applyResolvedOpenings({ directOpeningById, nodeOrder, nodesById: openingNodes, pdfOpeningById: new Map() });
  const normalized = normalizeWorkspaceSnapshot({ activeNodeId: current.activeNodeId,
    nodeOrder, nodesById: openingNodes, trashedNodeIds: [], trashedNodeDeletedAtById: {} });
  for (const [id, node] of Object.entries(normalized.nodesById)) {
    const original = nodesById[id];
    if (original && node.openingText === original.openingText) normalized.nodesById[id] = original;
  }
  const next = { ...current, ...normalized,
    nodeOpenStateById: mergeNodeOpenStateById(current.nodeOpenStateById, projection.nodeOpenStateById),
    untitledSequenceByParent: { ...current.untitledSequenceByParent, ...projection.untitledSequenceByParent } };
  next.activeNodeId = resolveWorkspaceSnapshotActiveNodeId(next);
  return { ...next, reviewSession: reconcileReviewSession(next) };
}
