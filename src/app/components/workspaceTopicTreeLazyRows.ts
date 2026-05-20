import { useMemo } from 'react';

import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export type TopicChildrenByParent = Map<string | null, string[]>;

function isTopicNode(nodeId: string, nodesById: WorkspaceListNodesById) {
  const node = nodesById[nodeId];
  return Boolean(node && node.kind !== 'folder');
}

export function buildTopicChildrenByParent(
  itemIds: string[],
  nodesById: WorkspaceListNodesById
): TopicChildrenByParent {
  const knownIds = new Set(itemIds);
  const childrenByParent: TopicChildrenByParent = new Map();
  itemIds.forEach((nodeId) => {
    const node = nodesById[nodeId];
    if (!node || node.kind === 'folder') return;
    const parentId = node.parentNodeId && knownIds.has(node.parentNodeId) ? node.parentNodeId : null;
    const children = childrenByParent.get(parentId);
    if (children) {
      children.push(nodeId);
    } else {
      childrenByParent.set(parentId, [nodeId]);
    }
  });
  return childrenByParent;
}

export function getTopicChildren(parentId: string | null, childrenByParent: TopicChildrenByParent, nodesById: WorkspaceListNodesById) {
  return (childrenByParent.get(parentId) ?? []).filter((nodeId) => isTopicNode(nodeId, nodesById));
}

export function buildTopicParentIdByNodeId(
  childrenByParent: TopicChildrenByParent
) {
  const parentIdByNodeId = new Map<string, string | null>();
  childrenByParent.forEach((nodeIds, parentId) => {
    nodeIds.forEach((nodeId) => {
      parentIdByNodeId.set(nodeId, parentId);
    });
  });
  return parentIdByNodeId;
}

function createRow(nodeId: string, depth: number, childrenByParent: TopicChildrenByParent, nodesById: WorkspaceListNodesById): NodeTreeRow | null {
  const node = nodesById[nodeId];
  if (!node || node.kind === 'folder') return null;
  const childIds = getTopicChildren(nodeId, childrenByParent, nodesById);
  return {
    descendantCount: childIds.length,
    depth,
    hasChildren: childIds.length > 0,
    node
  };
}

function collectRows(args: TopicRowsArgs) {
  const rows: NodeTreeRow[] = [];
  const walk = (parentId: string | null, ids: string[], depth: number) => {
    args.sortIds(parentId, ids).forEach((nodeId) => {
      if (!shouldCollectNode(args, nodeId, args.reviewContextNodeIds ?? null)) return;
      const row = createRow(nodeId, depth, args.childrenByParent, args.nodesById);
      if (!row) return;
      rows.push(row);
      if (!args.collapsedNodeIds.has(nodeId)) {
        walk(nodeId, getTopicChildren(nodeId, args.childrenByParent, args.nodesById), depth + 1);
      }
    });
  };
  walk(null, args.rootIds, 0);
  return rows;
}

function collectSearchRows(args: Omit<TopicRowsArgs, 'collapsedNodeIds'>) {
  const normalizedQuery = args.searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) return null;
  const rows: NodeTreeRow[] = [];
  const walk = (parentId: string | null, ids: string[], depth: number): boolean => {
    let hasMatch = false;
    args.sortIds(parentId, ids).forEach((nodeId) => {
      const childIds = getTopicChildren(nodeId, args.childrenByParent, args.nodesById);
      const childMatched = walk(nodeId, childIds, depth + 1);
      const nodeMatched = args.nodesById[nodeId]?.title.toLocaleLowerCase().includes(normalizedQuery) ?? false;
      if (!nodeMatched && !childMatched) return;
      const row = createRow(nodeId, depth, args.childrenByParent, args.nodesById);
      if (row) rows.push(row);
      hasMatch = true;
    });
    return hasMatch;
  };

  walk(null, args.rootIds, 0);
  return rows;
}

interface TopicRowsArgs {
  childrenByParent: TopicChildrenByParent;
  collapsedNodeIds: ReadonlySet<string>;
  hideDismissedTopics?: boolean;
  nodesById: WorkspaceListNodesById;
  reviewTargetNodeId?: string | null;
  reviewContextNodeIds?: ReadonlySet<string> | null;
  rootIds: string[];
  searchQuery: string;
  sortIds: (parentId: string | null, ids: string[]) => string[];
}

function isDismissedTopic(nodeId: string, nodesById: WorkspaceListNodesById) {
  return nodesById[nodeId]?.reading?.state === 'dismissed';
}

function buildParentIdByNodeId(childrenByParent: TopicChildrenByParent) {
  const parentIdByNodeId = new Map<string, string | null>();
  childrenByParent.forEach((nodeIds, parentId) => {
    nodeIds.forEach((nodeId) => parentIdByNodeId.set(nodeId, parentId));
  });
  return parentIdByNodeId;
}

function collectReviewContextNodeIds(args: Pick<TopicRowsArgs, 'childrenByParent' | 'nodesById' | 'reviewTargetNodeId'>) {
  const contextNodeIds = new Set<string>();
  const targetNodeId = args.reviewTargetNodeId;
  if (!targetNodeId || !args.nodesById[targetNodeId]) return contextNodeIds;
  const parentIdByNodeId = buildParentIdByNodeId(args.childrenByParent);
  let currentNodeId: string | null | undefined = targetNodeId;
  while (currentNodeId) {
    if (contextNodeIds.has(currentNodeId)) break;
    contextNodeIds.add(currentNodeId);
    currentNodeId = parentIdByNodeId.get(currentNodeId) ?? null;
  }
  return contextNodeIds;
}

function shouldCollectNode(args: TopicRowsArgs, nodeId: string, reviewContextNodeIds: ReadonlySet<string> | null) {
  if (reviewContextNodeIds) {
    return !isDismissedTopic(nodeId, args.nodesById) || reviewContextNodeIds.has(nodeId);
  }
  return !args.hideDismissedTopics || !isDismissedTopic(nodeId, args.nodesById);
}

export function useTopicRows(args: TopicRowsArgs) {
  const { childrenByParent, collapsedNodeIds, nodesById, reviewTargetNodeId, rootIds, searchQuery, sortIds } = args;
  const hideDismissedTopics = args.hideDismissedTopics ?? false;
  const activeReviewTargetNodeId = reviewTargetNodeId ?? null;
  return useMemo(() => {
    const searchRows = collectSearchRows({ childrenByParent, nodesById, rootIds, searchQuery, sortIds });
    if (searchRows) return searchRows;
    const reviewContextNodeIds = activeReviewTargetNodeId
      ? collectReviewContextNodeIds({ childrenByParent, nodesById, reviewTargetNodeId: activeReviewTargetNodeId })
      : null;
    if (!hideDismissedTopics && !reviewContextNodeIds) {
      return collectRows({ childrenByParent, collapsedNodeIds, nodesById, rootIds, searchQuery, sortIds });
    }
    return collectRows({
      childrenByParent,
      collapsedNodeIds,
      hideDismissedTopics,
      nodesById,
      reviewTargetNodeId: activeReviewTargetNodeId,
      reviewContextNodeIds,
      rootIds,
      searchQuery,
      sortIds
    });
  }, [activeReviewTargetNodeId, childrenByParent, collapsedNodeIds, hideDismissedTopics, nodesById, rootIds, searchQuery, sortIds]);
}
