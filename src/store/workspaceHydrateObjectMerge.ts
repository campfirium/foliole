import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import type { WorkspacePersistedState, WorkspaceState } from './workspaceStoreTypes';

export function mergeNodeOpenStateById(
  current: WorkspaceState['nodeOpenStateById'],
  next: WorkspacePersistedState['nodeOpenStateById']
) {
  const merged = { ...current };
  for (const [nodeId, openState] of Object.entries(next ?? {})) {
    if (openState && (!merged[nodeId] || timestampValue(openState.lastOpenedAt) > timestampValue(merged[nodeId]?.lastOpenedAt))) {
      merged[nodeId] = openState;
    }
  }
  return merged;
}

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

function chooseDeletedAt(current: Node | undefined, next: Node) {
  if (next.deletedAt) {
    if (!current?.deletedAt || timestampValue(next.deletedAt) >= timestampValue(current.deletedAt)) {
      return next.deletedAt;
    }
    return current.deletedAt;
  }
  if (current?.deletedAt && timestampValue(next.updatedAt) <= timestampValue(current.deletedAt)) {
    return current.deletedAt;
  }
  return undefined;
}

function mergeDeletedAt(node: Node, deletedAt: string | undefined): Node {
  if (deletedAt) {
    return { ...node, deletedAt };
  }
  const nextNode = { ...node };
  delete nextNode.deletedAt;
  return nextNode;
}

function withDeletedAt(node: Node, deletedAt: string | undefined): Node {
  return deletedAt && !node.deletedAt ? { ...node, deletedAt } : node;
}

export function mergeHydratedNode(current: Node | undefined, next: Node) {
  if (!current) {
    return next;
  }
  const baseNode = isNewerTimestamp(current.updatedAt, next.updatedAt) ? current : next;
  return mergeDeletedAt({
    ...baseNode,
    reading: chooseReadingProfile(current.reading, next.reading),
    review: chooseReviewProfile(current.review, next.review)
  }, chooseDeletedAt(current, next));
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
      nodesById[nodeId] = mergeHydratedNode(
        currentNode ? withDeletedAt(currentNode, current.trashedNodeDeletedAtById[nodeId]) : undefined,
        withDeletedAt(nextNode, next.trashedNodeDeletedAtById?.[nodeId])
      );
      continue;
    }
    if (currentNode && shouldKeepCurrentOnlyNode(
      currentNode,
      currentNode.deletedAt ?? current.trashedNodeDeletedAtById[nodeId],
      snapshotVersion
    )) {
      nodesById[nodeId] = withDeletedAt(currentNode, current.trashedNodeDeletedAtById[nodeId]);
    }
  }
  return nodesById;
}

function buildMergedTrash(args: {
  current: WorkspaceState;
  nodesById: Record<string, Node>;
  snapshotVersion: string | null | undefined;
}) {
  for (const [nodeId, deletedAt] of Object.entries(args.current.trashedNodeDeletedAtById)) {
    if (isAfterSnapshot(deletedAt, args.snapshotVersion) && args.nodesById[nodeId]) {
      args.nodesById[nodeId] = withDeletedAt(args.nodesById[nodeId], deletedAt);
    }
  }
  const trashedNodeDeletedAtById = Object.fromEntries(
    Object.entries(args.nodesById)
      .filter((entry): entry is [string, Node & { deletedAt: string }] => typeof entry[1].deletedAt === 'string')
      .map(([nodeId, node]) => [nodeId, node.deletedAt])
  );
  const trashedNodeIds = uniqueNodeOrder(args.current.trashedNodeIds, Object.keys(trashedNodeDeletedAtById))
    .filter((nodeId) => Boolean(args.nodesById[nodeId]?.deletedAt));
  return { trashedNodeDeletedAtById, trashedNodeIds };
}

export function mergeHydratedWorkspaceMembership(
  current: WorkspaceState,
  next: Partial<WorkspacePersistedState>
) {
  const normalizedNext = normalizeWorkspaceSnapshot({
    activeNodeId: next.activeNodeId ?? null,
    nodeOrder: next.nodeOrder ?? [],
    nodesById: next.nodesById ?? {},
    trashedNodeDeletedAtById: next.trashedNodeDeletedAtById ?? {},
    trashedNodeIds: next.trashedNodeIds ?? []
  });
  const snapshotVersion = next.capturedWorkspaceVersion;
  const nodesById = buildMergedNodesById(current, normalizedNext, snapshotVersion);
  const trash = buildMergedTrash({ current, nodesById, snapshotVersion });
  const trashedNodeSet = new Set(trash.trashedNodeIds);
  const nodeOrder = uniqueNodeOrder(next.nodeOrder ?? [], current.nodeOrder)
    .filter((nodeId) => Boolean(nodesById[nodeId] && !nodesById[nodeId]?.deletedAt && !trashedNodeSet.has(nodeId)));
  return {
    nodeOrder,
    nodesById,
    ...trash
  };
}
