import { useCallback, useMemo, useState } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { NodeViewState } from '../../store/workspaceStore';

import { sortWorkspaceContentNodeIds } from './workspaceContentNodeOrder';
import { normalizeWorkspaceContentSort, type WorkspaceContentSortState } from './workspaceContentSort';
import { useStableWorkspaceContentItems } from './workspaceStableContentSort';
import { useCollapsedTopicNodeIds } from './workspaceTopicTreeCollapseModel';
import {
  buildTopicParentIdByNodeId,
  getTopicChildren,
  type TopicChildrenByParent,
  useTopicRows
} from './workspaceTopicTreeLazyRows';

interface WorkspaceTopicTreeLazyModelArgs {
  activeFolderId: string;
  activeNodeId: string | null;
  childrenByParent: TopicChildrenByParent;
  forceVisibleNodeId?: string | null;
  itemIds: string[];
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: WorkspaceListNodesById;
  sortRefreshVersion?: number;
  sort: WorkspaceContentSortState;
}

export function useWorkspaceTopicTreeLazyModel(args: WorkspaceTopicTreeLazyModelArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const contentSort = normalizeWorkspaceContentSort(args.sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name']);
  const rootIds = useStableWorkspaceContentItems({
    getItemId: (nodeId) => nodeId,
    items: args.itemIds,
    refreshKey: args.sortRefreshVersion,
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
  const parentIdByNodeId = useMemo(
    () => buildTopicParentIdByNodeId(args.childrenByParent),
    [args.childrenByParent]
  );
  const collapse = useCollapsedTopicNodeIds({
    ...buildTopicCollapseArgs(args),
    childrenByParent: args.childrenByParent,
    collapsibleNodeIds: initialCollapsibleNodeIds,
    parentIdByNodeId
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

function buildTopicCollapseArgs(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  forceVisibleNodeId?: string | null;
}) {
  return {
    activeFolderId: args.activeFolderId,
    activeNodeId: args.activeNodeId,
    ...(args.forceVisibleNodeId !== undefined
      ? { forceVisibleNodeId: args.forceVisibleNodeId }
      : {})
  };
}
