export interface WorkspaceCanonicalNode {
  deletedAt?: string | null;
  id: string;
}

export interface WorkspaceCanonicalSource<TNode extends WorkspaceCanonicalNode> {
  nodeOrder: readonly string[];
  nodesById: Record<string, TNode | undefined>;
  trashedNodeDeletedAtById?: Record<string, string | undefined>;
  trashedNodeIds?: readonly string[];
}

interface CachedReviewQueueSource {
  nodeOrder: readonly string[];
  nodesById: Record<string, WorkspaceCanonicalNode | undefined>;
  result: {
    nodeOrder: string[];
    nodesById: Record<string, WorkspaceCanonicalNode>;
    trashedNodeIds: string[];
  };
  trashedNodeDeletedAtById: Record<string, string | undefined> | undefined;
  trashedNodeIds: readonly string[] | undefined;
}

let cachedReviewQueueSource: CachedReviewQueueSource | null = null;

function uniqueIds(ids: readonly string[]) {
  return [...new Set(ids)];
}

function areStringArraysEqual(previous: readonly string[], next: readonly string[]) {
  return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

function hasDeletedAt(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNodeLifecycleFact(node: WorkspaceCanonicalNode | undefined) {
  return node?.deletedAt !== undefined;
}

function isCanonicallyDeleted<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>,
  nodeId: string
) {
  const node = source.nodesById[nodeId];
  if (!node) return false;
  if (hasNodeLifecycleFact(node)) return hasDeletedAt(node.deletedAt);
  return Boolean(hasDeletedAt(source.trashedNodeDeletedAtById?.[nodeId]) || source.trashedNodeIds?.includes(nodeId));
}

function resolveCanonicalDeletedAt<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>,
  nodeId: string
) {
  const node = source.nodesById[nodeId];
  if (!node) return null;
  if (hasNodeLifecycleFact(node)) return hasDeletedAt(node.deletedAt) ? node.deletedAt : null;
  const legacyDeletedAt = source.trashedNodeDeletedAtById?.[nodeId];
  return hasDeletedAt(legacyDeletedAt) ? legacyDeletedAt : null;
}

export function isCanonicalVisibleNodeId<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>,
  nodeId: string
) {
  return Boolean(source.nodesById[nodeId] && !isCanonicallyDeleted(source, nodeId));
}

export function isCanonicalTrashedNodeId<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>,
  nodeId: string
) {
  return isCanonicallyDeleted(source, nodeId);
}

export function selectCanonicalNodeMembership<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>,
  nodeId: string
) {
  const isTrashed = isCanonicalTrashedNodeId(source, nodeId);
  return {
    isTrashed,
    isVisible: Boolean(source.nodesById[nodeId] && !isTrashed)
  };
}

export function selectCanonicalVisibleNodeIds<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>
) {
  return uniqueIds(source.nodeOrder).filter((nodeId) => isCanonicalVisibleNodeId(source, nodeId));
}

export function selectCanonicalTrashedNodeIds<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>
) {
  const candidateIds = uniqueIds([
    ...(source.trashedNodeIds ?? []),
    ...Object.keys(source.trashedNodeDeletedAtById ?? {}),
    ...source.nodeOrder,
    ...Object.keys(source.nodesById)
  ]);
  return candidateIds.filter((nodeId) => isCanonicalTrashedNodeId(source, nodeId));
}

export function selectCanonicalTrashedNodeDeletedAtById<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>
) {
  return selectCanonicalTrashedNodeIds(source).reduce<Record<string, string>>((acc, nodeId) => {
    const deletedAt = resolveCanonicalDeletedAt(source, nodeId);
    if (deletedAt) acc[nodeId] = deletedAt;
    return acc;
  }, {});
}

export function selectCanonicalReviewQueueSource<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>
) {
  if (
    cachedReviewQueueSource &&
    cachedReviewQueueSource.nodeOrder === source.nodeOrder &&
    cachedReviewQueueSource.nodesById === source.nodesById &&
    cachedReviewQueueSource.trashedNodeDeletedAtById === source.trashedNodeDeletedAtById &&
    cachedReviewQueueSource.trashedNodeIds === source.trashedNodeIds
  ) {
    return cachedReviewQueueSource.result as {
      nodeOrder: string[];
      nodesById: Record<string, TNode>;
      trashedNodeIds: string[];
    };
  }
  const visibleNodeIds = selectCanonicalVisibleNodeIds(source);
  const trashedNodeIds = selectCanonicalTrashedNodeIds(source);
  const result = {
    nodeOrder: areStringArraysEqual(source.nodeOrder, visibleNodeIds)
      ? (source.nodeOrder as string[])
      : visibleNodeIds,
    nodesById: source.nodesById as Record<string, TNode>,
    trashedNodeIds: source.trashedNodeIds && areStringArraysEqual(source.trashedNodeIds, trashedNodeIds)
      ? (source.trashedNodeIds as string[])
      : trashedNodeIds
  };
  cachedReviewQueueSource = {
    nodeOrder: source.nodeOrder,
    nodesById: source.nodesById,
    result,
    trashedNodeDeletedAtById: source.trashedNodeDeletedAtById,
    trashedNodeIds: source.trashedNodeIds
  };
  return result;
}

export function selectCanonicalWorkspaceMembershipView<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>
) {
  const nodeOrder = selectCanonicalVisibleNodeIds(source);
  const trashedNodeIds = selectCanonicalTrashedNodeIds(source);
  return {
    nodeOrder,
    reviewQueueSource: {
      nodeOrder,
      nodesById: source.nodesById as Record<string, TNode>,
      trashedNodeIds
    },
    trashedNodeDeletedAtById: selectCanonicalTrashedNodeDeletedAtById(source),
    trashedNodeIds
  };
}
