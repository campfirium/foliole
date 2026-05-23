import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import type { WorkspacePersistedState, WorkspaceState } from './workspaceStoreTypes';

function timestampValue(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function isNewerTimestamp(left: string | null | undefined, right: string | null | undefined) {
  return timestampValue(left) >= timestampValue(right);
}

function chooseReviewProfile(
  current: NodeReviewProfile | null | undefined,
  next: NodeReviewProfile | null | undefined
) {
  if (!current || !next) {
    return next ?? current ?? null;
  }
  return isNewerTimestamp(current.lastReviewAt, next.lastReviewAt) ? current : next;
}

function chooseReadingProfile(
  current: NodeReadingProfile | null | undefined,
  next: NodeReadingProfile | null | undefined
) {
  if (!current || !next) {
    return next ?? current ?? null;
  }
  return isNewerTimestamp(current.lastHandledAt, next.lastHandledAt) ? current : next;
}

export function mergeHydratedNode(current: Node | undefined, next: Node) {
  if (!current) {
    return next;
  }
  const baseNode = isNewerTimestamp(current.updatedAt, next.updatedAt) ? current : next;
  return {
    ...baseNode,
    reading: chooseReadingProfile(current.reading, next.reading),
    review: chooseReviewProfile(current.review, next.review)
  };
}

export function mergeHydratedNodesById(current: Record<string, Node>, next: Record<string, Node>) {
  const nodesById: Record<string, Node> = {};
  for (const [nodeId, nextNode] of Object.entries(next)) {
    nodesById[nodeId] = mergeHydratedNode(current[nodeId], nextNode);
  }
  return nodesById;
}

function isAfterSnapshot(value: string | null | undefined, snapshotVersion: string | null | undefined) {
  return Boolean(snapshotVersion && value && timestampValue(value) > timestampValue(snapshotVersion));
}

function uniqueNodeOrder(...orders: string[][]) {
  return [...new Set(orders.flat())];
}

function shouldKeepCurrentOnlyNode(
  node: Node,
  deletedAt: string | undefined,
  snapshotVersion: string | null | undefined
) {
  return isAfterSnapshot(node.createdAt, snapshotVersion) || isAfterSnapshot(deletedAt, snapshotVersion);
}

function buildMergedNodesById(
  current: WorkspaceState,
  next: Partial<WorkspacePersistedState>,
  snapshotVersion: string | null | undefined
) {
  const nodesById: Record<string, Node> = {};
  const nextNodesById = next.nodesById ?? {};
  for (const nodeId of uniqueNodeOrder(Object.keys(nextNodesById), Object.keys(current.nodesById))) {
    const nextNode = nextNodesById[nodeId];
    const currentNode = current.nodesById[nodeId];
    if (nextNode) {
      nodesById[nodeId] = mergeHydratedNode(currentNode, nextNode);
      continue;
    }
    if (currentNode && shouldKeepCurrentOnlyNode(
      currentNode,
      current.trashedNodeDeletedAtById[nodeId],
      snapshotVersion
    )) {
      nodesById[nodeId] = currentNode;
    }
  }
  return nodesById;
}

function buildMergedTrash(args: {
  current: WorkspaceState;
  next: Partial<WorkspacePersistedState>;
  nodesById: Record<string, Node>;
  snapshotVersion: string | null | undefined;
}) {
  const trashedNodeDeletedAtById = { ...(args.next.trashedNodeDeletedAtById ?? {}) };
  for (const [nodeId, deletedAt] of Object.entries(args.current.trashedNodeDeletedAtById)) {
    if (isAfterSnapshot(deletedAt, args.snapshotVersion) && args.nodesById[nodeId]) {
      trashedNodeDeletedAtById[nodeId] = deletedAt;
    }
  }
  const trashedNodeIds = uniqueNodeOrder(args.next.trashedNodeIds ?? [], args.current.trashedNodeIds)
    .filter((nodeId) => Boolean(args.nodesById[nodeId] && trashedNodeDeletedAtById[nodeId]));
  return { trashedNodeDeletedAtById, trashedNodeIds };
}

export function mergeHydratedWorkspaceMembership(
  current: WorkspaceState,
  next: Partial<WorkspacePersistedState>
) {
  const snapshotVersion = next.capturedWorkspaceVersion;
  const nodesById = buildMergedNodesById(current, next, snapshotVersion);
  const trash = buildMergedTrash({ current, next, nodesById, snapshotVersion });
  const trashedNodeSet = new Set(trash.trashedNodeIds);
  const nodeOrder = uniqueNodeOrder(next.nodeOrder ?? [], current.nodeOrder)
    .filter((nodeId) => Boolean(nodesById[nodeId] && !trashedNodeSet.has(nodeId)));
  return {
    nodeOrder,
    nodesById,
    ...trash
  };
}
