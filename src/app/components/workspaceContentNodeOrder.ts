import { getTextAnchorLocators } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { compareWorkspaceContentNodes, type WorkspaceContentSortState } from './workspaceContentSort';

function resolveTextAnchorPosition(node: WorkspaceListNode | undefined) {
  const locators = getTextAnchorLocators(node?.anchorLink?.locator);
  if (locators.length === 0) {
    return null;
  }
  return locators.reduce(
    (current, locator) => (locator.from < current.from || (locator.from === current.from && locator.to < current.to) ? locator : current),
    locators[0]!
  );
}

function compareTextAnchorOrder(left: WorkspaceListNode, right: WorkspaceListNode) {
  const leftPosition = resolveTextAnchorPosition(left);
  const rightPosition = resolveTextAnchorPosition(right);
  if (!leftPosition || !rightPosition) {
    return 0;
  }
  if (leftPosition.from !== rightPosition.from) {
    return leftPosition.from - rightPosition.from;
  }
  if (leftPosition.to !== rightPosition.to) {
    return leftPosition.to - rightPosition.to;
  }
  return left.id.localeCompare(right.id);
}

export function sortWorkspaceContentNodeIds(
  nodeIds: string[],
  nodesById: WorkspaceListNodesById,
  sort: WorkspaceContentSortState,
  nodeOpenStateById: Record<string, { lastOpenedAt?: string | null } | undefined> = {},
  manualChildOrder?: readonly string[] | null
) {
  const knownIds = new Set(nodeIds.filter((nodeId) => Boolean(nodesById[nodeId])));
  const childrenByParent = new Map<string | null, string[]>();

  nodeIds.forEach((nodeId) => {
    const node = nodesById[nodeId];
    if (!node) return;
    const parentId = node.parentNodeId && knownIds.has(node.parentNodeId) ? node.parentNodeId : null;
    const children = childrenByParent.get(parentId);
    if (children) {
      children.push(nodeId);
    } else {
      childrenByParent.set(parentId, [nodeId]);
    }
  });

  const sortIds = (ids: string[]) =>
    sort.key === 'manual'
      ? sortWorkspaceContentManualNodeIds(ids, nodesById, manualChildOrder)
      : [...ids].sort((leftId, rightId) => compareWorkspaceContentNodes(
          nodesById[leftId]!,
          nodesById[rightId]!,
          sort,
          nodeOpenStateById
        ));

  const sortedIds: string[] = [];
  const walk = (parentId: string | null) => {
    const childIds =
      parentId === null
        ? sortIds(childrenByParent.get(parentId) ?? [])
        : sortWorkspaceContentChildNodeIds(childrenByParent.get(parentId) ?? [], nodesById);
    childIds.forEach((nodeId) => {
      sortedIds.push(nodeId);
      walk(nodeId);
    });
  };
  walk(null);
  return sortedIds;
}

function sortWorkspaceContentManualNodeIds(
  nodeIds: string[],
  nodesById: WorkspaceListNodesById,
  manualChildOrder?: readonly string[] | null
) {
  const remainingIds = new Set(nodeIds);
  const orderedIds: string[] = [];
  for (const nodeId of manualChildOrder ?? []) {
    if (remainingIds.delete(nodeId)) {
      orderedIds.push(nodeId);
    }
  }
  const missingIds = [...remainingIds].sort((leftId, rightId) =>
    compareWorkspaceContentNodes(nodesById[leftId]!, nodesById[rightId]!, { direction: 'asc', key: 'name' })
  );
  return [...orderedIds, ...missingIds];
}

export function sortWorkspaceContentChildNodeIds(
  nodeIds: string[],
  nodesById: WorkspaceListNodesById
) {
  if (!nodeIds.every((nodeId) => resolveTextAnchorPosition(nodesById[nodeId]) !== null)) {
    return nodeIds;
  }
  return [...nodeIds].sort((leftId, rightId) => compareTextAnchorOrder(nodesById[leftId]!, nodesById[rightId]!));
}
