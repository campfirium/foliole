interface WorkspaceCanonicalNode {
  deletedAt?: string | null;
  id: string;
}

interface WorkspaceCanonicalSource<TNode extends WorkspaceCanonicalNode> {
  nodeOrder: string[];
  nodesById: Record<string, TNode | undefined>;
  trashedNodeDeletedAtById?: Record<string, string>;
  trashedNodeIds?: string[];
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function resolveCanonicalDeletedAt<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>,
  nodeId: string
) {
  const node = source.nodesById[nodeId];
  if (!node) return null;
  if (node.deletedAt !== undefined) return node.deletedAt;
  if (source.trashedNodeDeletedAtById?.[nodeId]) return source.trashedNodeDeletedAtById[nodeId];
  return source.trashedNodeIds?.includes(nodeId) ? '' : null;
}

export function selectCanonicalVisibleNodeIds<TNode extends WorkspaceCanonicalNode>(
  source: WorkspaceCanonicalSource<TNode>
) {
  return uniqueIds(source.nodeOrder).filter((nodeId) => {
    const node = source.nodesById[nodeId];
    return Boolean(node && !resolveCanonicalDeletedAt(source, nodeId));
  });
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
  return candidateIds.filter((nodeId) => Boolean(source.nodesById[nodeId] && resolveCanonicalDeletedAt(source, nodeId) !== null));
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
