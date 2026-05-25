import { isCanonicalTrashedNodeId } from '../../../shared/workspaceCanonicalSelectors';

import type { Node } from './nodeTypes';
import type { WorkspaceListNode, WorkspaceListNodesById } from './workspaceListNode';

type TrashNode = Pick<Node | WorkspaceListNode, 'id' | 'parentNodeId' | 'title'> & {
  deletedAt?: string | null;
};

function isTrashedNode(
  nodeId: string,
  nodesById: Record<string, TrashNode | undefined>,
  trashedNodeIds: readonly string[]
) {
  return isCanonicalTrashedNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, nodeId);
}

export function resolveTrashRootId(
  nodeId: string,
  nodesById: Record<string, TrashNode | undefined>,
  trashedNodeIds: readonly string[]
) {
  if (!isTrashedNode(nodeId, nodesById, trashedNodeIds)) return null;

  let rootId = nodeId;
  let current = nodesById[nodeId];
  while (current?.parentNodeId && isTrashedNode(current.parentNodeId, nodesById, trashedNodeIds)) {
    rootId = current.parentNodeId;
    current = nodesById[current.parentNodeId];
  }
  return rootId;
}

function collectTrashCandidateIds(nodeOrder: readonly string[], trashedNodeIds: readonly string[]) {
  return [...new Set([...nodeOrder, ...trashedNodeIds])];
}

export function selectTrashRootIds(
  nodeOrder: readonly string[],
  nodesById: Record<string, TrashNode | undefined>,
  trashedNodeIds: readonly string[]
) {
  const rootIds = new Set<string>();
  for (const nodeId of collectTrashCandidateIds(nodeOrder, trashedNodeIds)) {
    if (resolveTrashRootId(nodeId, nodesById, trashedNodeIds) === nodeId) {
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
  for (const nodeId of collectTrashCandidateIds(nodeOrder, trashedNodeIds)) {
    if (!matchesQuery(nodesById[nodeId], normalizedQuery)) continue;
    const rootId = resolveTrashRootId(nodeId, nodesById, trashedNodeIds);
    if (rootId && rootIdSet.has(rootId)) {
      matchingRootIds.add(rootId);
    }
  }
  return rootIds.filter((nodeId) => matchingRootIds.has(nodeId));
}
