export interface WorkspaceCanonicalNode {
  deletedAt?: string | null;
  id: string;
}

export interface WorkspaceCanonicalSource<TNode extends WorkspaceCanonicalNode> {
  nodeOrder: string[];
  nodesById: Record<string, TNode | undefined>;
  trashedNodeDeletedAtById?: Record<string, string | undefined>;
  trashedNodeIds?: string[];
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
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
  return {
    nodeOrder: selectCanonicalVisibleNodeIds(source),
    nodesById: source.nodesById as Record<string, TNode>,
    trashedNodeIds: selectCanonicalTrashedNodeIds(source)
  };
}
