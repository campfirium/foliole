import { useCallback, useMemo, useState } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { NodeViewState } from '../../store/workspaceStore';

import { sortWorkspaceContentNodeIds } from './workspaceContentNodeOrder';
import { normalizeWorkspaceContentSort, type WorkspaceContentSortState } from './workspaceContentSort';
import { useStableWorkspaceContentItems } from './workspaceStableContentSort';
import { collectActiveAncestorIds, useCollapsedTopicNodeIds } from './workspaceTopicTreeCollapseModel';
import { getTopicChildren, type TopicChildrenByParent, useTopicRows } from './workspaceTopicTreeLazyRows';

export function useWorkspaceTopicTreeLazyModel(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  childrenByParent: TopicChildrenByParent;
  itemIds: string[];
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: WorkspaceListNodesById;
  sort: WorkspaceContentSortState;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const contentSort = normalizeWorkspaceContentSort(args.sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name']);
  const rootIds = useStableWorkspaceContentItems({
    getItemId: (nodeId) => nodeId,
    items: args.itemIds,
    scopeKey: `${args.activeFolderId}:root`,
    sort: contentSort,
    sortItems: (ids) => sortWorkspaceContentNodeIds(ids, args.nodesById, contentSort, args.nodeViewById)
  });
  const sortIds = useCallback(
    (parentId: string | null, ids: string[]) =>
      parentId === null ? rootIds.filter((nodeId) => ids.includes(nodeId)) : sortWorkspaceContentNodeIds(ids, args.nodesById, contentSort, args.nodeViewById),
    [args.nodeViewById, args.nodesById, contentSort, rootIds]
  );
  const initialCollapsibleNodeIds = useMemo(
    () => rootIds.filter((nodeId) => getTopicChildren(nodeId, args.childrenByParent, args.nodesById).length > 0),
    [args.childrenByParent, args.nodesById, rootIds]
  );
  const expandedNodeIds = useMemo(
    () => collectActiveAncestorIds(args.activeNodeId, rootIds, args.nodesById),
    [args.activeNodeId, args.nodesById, rootIds]
  );
  const collapse = useCollapsedTopicNodeIds({
    activeFolderId: args.activeFolderId,
    activeNodeId: args.activeNodeId,
    collapsibleNodeIds: initialCollapsibleNodeIds,
    expandedNodeIds
  });
  const rows = useTopicRows({
    childrenByParent: args.childrenByParent,
    collapsedNodeIds: collapse.collapsedNodeIds,
    nodesById: args.nodesById,
    rootIds,
    searchQuery,
    sortIds
  });
  const collapsibleNodeIds = useMemo(
    () => rows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [rows]
  );

  return {
    collapsedNodeIds: collapse.collapsedNodeIds,
    collapsibleNodeIds,
    rows,
    searchQuery,
    setCollapsedNodeIds: collapse.setCollapsedNodeIds,
    setSearchQuery,
    sortedItemIds: rootIds
  };
}
