export type WorkspaceSnapshotFieldClass = 'entity' | 'derived' | 'session' | 'meta';

export interface WorkspaceSnapshotFieldManifestEntry {
  field: string;
  kind: WorkspaceSnapshotFieldClass;
}

export const WORKSPACE_SNAPSHOT_FIELD_MANIFEST: readonly WorkspaceSnapshotFieldManifestEntry[] = [
  { field: 'nodesById.*.id', kind: 'entity' },
  { field: 'nodesById.*.parentNodeId', kind: 'entity' },
  { field: 'nodesById.*.kind', kind: 'entity' },
  { field: 'nodesById.*.title', kind: 'entity' },
  { field: 'nodesById.*.bodyStatus', kind: 'entity' },
  { field: 'nodesById.*.bodyBlobHash', kind: 'entity' },
  { field: 'nodesById.*.openingText', kind: 'entity' },
  { field: 'nodesById.*.attachments', kind: 'entity' },
  { field: 'nodesById.*.currentVersionId', kind: 'entity' },
  { field: 'nodesById.*.deletedAt', kind: 'entity' },
  { field: 'nodeOrder', kind: 'derived' },
  { field: 'trashedNodeIds', kind: 'derived' },
  { field: 'trashedNodeDeletedAtById', kind: 'derived' },
  { field: 'activeNodeId', kind: 'session' },
  { field: 'nodeViewById', kind: 'session' },
  { field: 'persistedNodeViewById', kind: 'session' },
  { field: 'reviewSession', kind: 'session' },
  { field: 'rendererBoundaryKeepNodeIds', kind: 'session' },
  { field: 'capturedWorkspaceVersion', kind: 'meta' }
];

export interface WorkspaceSnapshotNodeContract {
  deletedAt?: string | null;
  id: string;
  parentNodeId?: string | null;
  updatedAt?: string;
}

export interface WorkspaceSnapshotContract<TNode extends WorkspaceSnapshotNodeContract> {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, TNode>;
  trashedNodeDeletedAtById?: Record<string, string | undefined>;
  trashedNodeIds: string[];
}

function uniqueIds(...groups: Array<Iterable<string> | undefined>) {
  return [...new Set(groups.flatMap((group) => Array.from(group ?? [])))];
}

function hasDeletedFact(node: WorkspaceSnapshotNodeContract | undefined): node is WorkspaceSnapshotNodeContract & { deletedAt: string } {
  return typeof node?.deletedAt === 'string' && node.deletedAt.trim().length > 0;
}

function hasLifecycleFact(node: WorkspaceSnapshotNodeContract | undefined) {
  return node?.deletedAt !== undefined;
}

function isTrashedSnapshotNode<TNode extends WorkspaceSnapshotNodeContract>(
  nodeId: string,
  node: TNode | undefined,
  deletedAtById: Record<string, string | undefined>,
  legacyTrashIds: Set<string>
) {
  if (!node) return false;
  if (hasLifecycleFact(node)) return hasDeletedFact(node);
  return Boolean(deletedAtById[nodeId] || legacyTrashIds.has(nodeId));
}

function normalizeNodesById<TNode extends WorkspaceSnapshotNodeContract>(
  nodesById: Record<string, TNode>,
  deletedAtById: Record<string, string | undefined> | undefined
) {
  const normalizedNodesById: Record<string, TNode> = {};
  for (const [nodeId, node] of Object.entries(nodesById)) {
    if (!node || node.id !== nodeId) {
      continue;
    }
    const legacyDeletedAt = deletedAtById?.[nodeId];
    normalizedNodesById[nodeId] = legacyDeletedAt && node.deletedAt === undefined
      ? { ...node, deletedAt: legacyDeletedAt }
      : node;
  }
  return normalizedNodesById;
}

export function resolveWorkspaceSnapshotActiveNodeId<TNode>(args: {
  activeNodeId: string | null | undefined;
  nodeOrder: readonly string[];
  nodesById: Record<string, TNode>;
  trashedNodeIds: readonly string[];
}) {
  const trashedNodeIds = new Set(args.trashedNodeIds);
  return (
    (args.activeNodeId && args.nodesById[args.activeNodeId] && !trashedNodeIds.has(args.activeNodeId)
      ? args.activeNodeId
      : null) ?? args.nodeOrder.find((nodeId) => args.nodesById[nodeId] && !trashedNodeIds.has(nodeId)) ?? null
  );
}

export function normalizeWorkspaceSnapshot<
  TNode extends WorkspaceSnapshotNodeContract,
  TSnapshot extends WorkspaceSnapshotContract<TNode>
>(snapshot: TSnapshot): TSnapshot {
  const nodesById = normalizeNodesById(snapshot.nodesById, snapshot.trashedNodeDeletedAtById);
  const legacyTrashIds = new Set(snapshot.trashedNodeIds);
  const trashedNodeDeletedAtById = Object.fromEntries(
    Object.entries(nodesById)
      .filter((entry): entry is [string, TNode & { deletedAt: string }] => hasDeletedFact(entry[1]))
      .map(([nodeId, node]) => [nodeId, node.deletedAt])
  );
  const trashedNodeIds = uniqueIds(snapshot.trashedNodeIds, Object.keys(trashedNodeDeletedAtById), Object.keys(nodesById))
    .filter((nodeId) => isTrashedSnapshotNode(nodeId, nodesById[nodeId], trashedNodeDeletedAtById, legacyTrashIds));
  const nodeOrder = uniqueIds(snapshot.nodeOrder, Object.keys(nodesById))
    .filter((nodeId) => Boolean(nodesById[nodeId] && !isTrashedSnapshotNode(nodeId, nodesById[nodeId], trashedNodeDeletedAtById, legacyTrashIds)));
  const activeNodeId = resolveWorkspaceSnapshotActiveNodeId({
    activeNodeId: snapshot.activeNodeId,
    nodeOrder,
    nodesById,
    trashedNodeIds
  });

  return {
    ...snapshot,
    activeNodeId,
    nodeOrder,
    nodesById,
    trashedNodeDeletedAtById,
    trashedNodeIds
  };
}

export function listVisibleWorkspaceSnapshotNodeIds<TNode extends WorkspaceSnapshotNodeContract>(
  snapshot: WorkspaceSnapshotContract<TNode>
) {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  return normalizedSnapshot.nodeOrder;
}

export function listTrashedWorkspaceSnapshotNodeIds<TNode extends WorkspaceSnapshotNodeContract>(
  snapshot: WorkspaceSnapshotContract<TNode>
) {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  return normalizedSnapshot.trashedNodeIds;
}
