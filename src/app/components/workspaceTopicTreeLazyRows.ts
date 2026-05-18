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
  nodesById: WorkspaceListNodesById;
  rootIds: string[];
  searchQuery: string;
  sortIds: (parentId: string | null, ids: string[]) => string[];
}

export function useTopicRows(args: TopicRowsArgs) {
  const { childrenByParent, collapsedNodeIds, nodesById, rootIds, searchQuery, sortIds } = args;
  return useMemo(() => {
    const searchRows = collectSearchRows({ childrenByParent, nodesById, rootIds, searchQuery, sortIds });
    if (searchRows) return searchRows;
    return collectRows({ childrenByParent, collapsedNodeIds, nodesById, rootIds, searchQuery, sortIds });
  }, [childrenByParent, collapsedNodeIds, nodesById, rootIds, searchQuery, sortIds]);
}
