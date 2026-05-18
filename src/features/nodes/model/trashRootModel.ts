import type { Node } from './nodeTypes';
import type { WorkspaceListNode, WorkspaceListNodesById } from './workspaceListNode';

type TrashNode = Pick<Node | WorkspaceListNode, 'id' | 'parentNodeId' | 'title'>;

function createTrashedNodeSet(trashedNodeIds: readonly string[]) {
  return new Set(trashedNodeIds);
}

function resolveTrashRootIdFromSet(
  nodeId: string,
  nodesById: Record<string, TrashNode | undefined>,
  trashedNodeSet: ReadonlySet<string>
) {
  if (!trashedNodeSet.has(nodeId)) return null;

  let rootId = nodeId;
  let current = nodesById[nodeId];
  while (current?.parentNodeId && trashedNodeSet.has(current.parentNodeId)) {
    rootId = current.parentNodeId;
    current = nodesById[current.parentNodeId];
  }
  return rootId;
}

export function resolveTrashRootId(
  nodeId: string,
  nodesById: Record<string, TrashNode | undefined>,
  trashedNodeIds: readonly string[]
) {
  return resolveTrashRootIdFromSet(nodeId, nodesById, createTrashedNodeSet(trashedNodeIds));
}

export function selectTrashRootIds(
  nodeOrder: readonly string[],
  nodesById: Record<string, TrashNode | undefined>,
  trashedNodeIds: readonly string[]
) {
  const rootIds = new Set<string>();
  const trashedNodeSet = createTrashedNodeSet(trashedNodeIds);
  for (const nodeId of nodeOrder) {
    if (resolveTrashRootIdFromSet(nodeId, nodesById, trashedNodeSet) === nodeId) {
      rootIds.add(nodeId);
    }
  }
  return [...rootIds];
}

function matchesQuery(node: TrashNode | undefined, normalizedQuery: string) {
  return Boolean(node?.title.toLocaleLowerCase().includes(normalizedQuery));
}

export function filterTrashRootIdsByTitle(
  rootIds: readonly string[],
  nodeOrder: readonly string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[],
  searchQuery: string
) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...rootIds];

  const rootIdSet = new Set(rootIds);
  const matchingRootIds = new Set<string>();
  const trashedNodeSet = createTrashedNodeSet(trashedNodeIds);
  for (const nodeId of nodeOrder) {
    if (!matchesQuery(nodesById[nodeId], normalizedQuery)) continue;
    const rootId = resolveTrashRootIdFromSet(nodeId, nodesById, trashedNodeSet);
    if (rootId && rootIdSet.has(rootId)) {
      matchingRootIds.add(rootId);
    }
  }
  return rootIds.filter((nodeId) => matchingRootIds.has(nodeId));
}
