import { useCallback, useMemo, useState } from 'react';

import type { NodeOpenState } from '../../../lib/core/database/nodeOpenState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { sortWorkspaceContentChildNodeIds, sortWorkspaceContentNodeIds } from './workspaceContentNodeOrder';
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
  hideDismissedTopics?: boolean;
  itemIds: string[];
  manualChildOrder?: readonly string[] | null;
  nodeOpenStateById: Record<string, NodeOpenState | undefined>;
  nodesById: WorkspaceListNodesById;
  sortRefreshVersion?: number;
  sort: WorkspaceContentSortState;
}

function getStringItemId(nodeId: string) {
  return nodeId;
}

export function useWorkspaceTopicTreeLazyModel(args: WorkspaceTopicTreeLazyModelArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const contentSort = normalizeWorkspaceContentSort(args.sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name', 'manual']);
  const refreshKey = resolveTopicTreeSortRefreshKey(args, contentSort);
  const sortRootIds = useCallback(
    (ids: string[]) =>
      sortWorkspaceContentNodeIds(ids, args.nodesById, contentSort, args.nodeOpenStateById, args.manualChildOrder),
    [args.manualChildOrder, args.nodeOpenStateById, args.nodesById, contentSort]
  );
  const rootIds = useStableWorkspaceContentItems({
    getItemId: getStringItemId,
    items: args.itemIds,
    refreshKey,
    scopeKey: `${args.activeFolderId}:root`,
    sort: contentSort,
    sortItems: sortRootIds
  });
  const sortIds = useCallback(
    (parentId: string | null, ids: string[]) =>
      parentId === null ? rootIds.filter((nodeId) => ids.includes(nodeId)) : sortWorkspaceContentChildNodeIds(ids, args.nodesById),
    [args.nodesById, rootIds]
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
    hideDismissedTopics: args.hideDismissedTopics ?? false,
    nodesById: args.nodesById,
    reviewTargetNodeId: args.forceVisibleNodeId ?? null,
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

function resolveTopicTreeSortRefreshKey(
  args: WorkspaceTopicTreeLazyModelArgs,
  sort: WorkspaceContentSortState
) {
  const baseKey = args.sortRefreshVersion ?? 0;
  if (sort.key === 'modifiedAt') {
    return `${baseKey}:${args.itemIds.map((nodeId) => args.nodesById[nodeId]?.updatedAt ?? '').join('\u0000')}`;
  }
  return baseKey;
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
