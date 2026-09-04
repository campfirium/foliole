import { memo, useMemo, useRef } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useDismissedTopicVisibility } from './useDismissedTopicVisibility';
import { useWorkspaceTopicTreeContentSort } from './useWorkspaceTopicTreeContentSort';
import {
  type CreateTopicTreeNode,
  useWorkspaceTopicTreeInteraction
} from './useWorkspaceTopicTreeInteraction';
import {
  resolveWorkspaceTopicTreeFocusNodeId,
  resolveWorkspaceTopicTreeTabStopNodeId,
  useWorkspaceTopicTreeAutoScroll
} from './workspaceTopicTreeFocus';
import {
  useWorkspaceTopicTreeLazyModel
} from './workspaceTopicTreeLazyModel';
import {
  buildTopicChildrenByParent,
  type TopicChildrenByParent
} from './workspaceTopicTreeLazyRows';
import { areWorkspaceTopicTreePropsEqual, useWorkspaceTopicTreeRenderDiagnostic } from './workspaceTopicTreeRenderDiagnostic';
import { resolveWorkspaceTopicTreeReviewScroll } from './workspaceTopicTreeReviewScroll';
import { renderWorkspaceTopicTreeShell } from './WorkspaceTopicTreeShell';

export interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  childrenByParent?: TopicChildrenByParent;
  creationParentNodeId?: string;
  emptyState?: { description: string; title: string };
  forceVisibleNodeId?: string | null;
  headerDescription?: string;
  itemIds: string[];
  virtualFolderView?: 'manual' | 'readonly';
  preserveItemOrder?: boolean;
  nodesById: WorkspaceListNodesById;
  onCreateChildNode?: CreateTopicTreeNode;
  onFocusEditor?: (nodeId: string, origin: HTMLButtonElement) => boolean;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  showCreateTopic?: boolean;
  topicFocusAvailable?: boolean;
}

function useWorkspaceTopicTreeData(props: WorkspaceTopicTreeProps) {
  const storedManualChildOrder = props.nodesById[props.activeFolderId]?.manualChildOrder ?? null;
  const manualChildOrder = props.preserveItemOrder ? props.itemIds : storedManualChildOrder;
  const contentSort = useWorkspaceTopicTreeContentSort(
    props.activeFolderId,
    Boolean(props.preserveItemOrder || storedManualChildOrder?.length)
  );
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const nodeOpenStateById = useWorkspaceStore((state) => state.nodeOpenStateById);
  const dismissedTopicVisibility = useDismissedTopicVisibility();
  const sort = contentSort.sort;
  const childrenByParent = useMemo(
    () => props.childrenByParent ?? buildTopicChildrenByParent(props.itemIds, props.nodesById),
    [props.childrenByParent, props.itemIds, props.nodesById]
  );
  const rootItemIds = props.childrenByParent ? props.itemIds : childrenByParent.get(null) ?? [];
  const lazyModel = useWorkspaceTopicTreeLazyModel({
    activeFolderId: props.activeFolderId,
    activeNodeId: props.activeNodeId,
    childrenByParent,
    itemIds: rootItemIds,
    manualChildOrder,
    nodeOpenStateById,
    nodesById: props.nodesById,
    sortRefreshVersion: contentSort.sortRefreshVersion,
    sort,
    hideDismissedTopics: props.topicFocusAvailable !== false && dismissedTopicVisibility.viewHideDismissedTopics,
    ...definedProps({ forceVisibleNodeId: props.forceVisibleNodeId })
  });
  return { contentSort, lazyModel, nodeViewById, dismissedTopicVisibility };
}

function resolveWorkspaceTopicTreeScrollState(
  props: WorkspaceTopicTreeProps,
  focusedNodeId: string | null,
  visibleRows: ReturnType<typeof useWorkspaceTopicTreeData>['lazyModel']['rows']
) {
  return {
    focusedRowIndex: focusedNodeId ? visibleRows.findIndex((row) => row.node.id === focusedNodeId) : -1,
    reviewScroll: resolveWorkspaceTopicTreeReviewScroll({
      activeFolderId: props.activeFolderId,
      focusedNodeId,
      forceVisibleNodeId: props.forceVisibleNodeId,
      nodesById: props.nodesById,
      rows: visibleRows
    })
  };
}

function useWorkspaceTopicTreeContext(props: WorkspaceTopicTreeProps) {
  const t = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const treeData = useWorkspaceTopicTreeData(props);
  useWorkspaceTopicTreeRenderDiagnostic(props, treeData);
  return { scrollContainerRef, t, treeData };
}

export const WorkspaceTopicTree = memo(function WorkspaceTopicTree(props: WorkspaceTopicTreeProps) {
  const { scrollContainerRef, t, treeData } = useWorkspaceTopicTreeContext(props);
  const { contentSort, lazyModel, nodeViewById, dismissedTopicVisibility } = treeData;
  const { collapsedNodeIds, collapsibleNodeIds, rows: visibleRows, searchQuery, setCollapsedNodeIds, setSearchQuery } = lazyModel;
  const focusedNodeId = resolveWorkspaceTopicTreeFocusNodeId({
    activeNodeId: props.activeNodeId,
    nodeViewState: props.activeNodeId ? nodeViewById[props.activeNodeId] : undefined,
    nodesById: props.nodesById,
    rows: visibleRows
  });
  const { focusedRowIndex, reviewScroll } = resolveWorkspaceTopicTreeScrollState(props, focusedNodeId, visibleRows);
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId: props.creationParentNodeId ?? props.activeFolderId,
    activeNodeId: props.activeNodeId,
    isManualSort: contentSort.sort.key === 'manual',
    manualOrderIds: lazyModel.sortedItemIds,
    ...definedProps({ virtualFolderView: props.virtualFolderView }),
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
    ...definedProps({ onCreateChildNode: props.onCreateChildNode }),
    ...definedProps({ onOpenPostponeTopicPanel: props.onOpenPostponeTopicPanel }),
    onSelectNode: props.onSelectNode,
    rowIds: visibleRows.map((row) => row.node.id)
  });
  useWorkspaceTopicTreeAutoScroll({
    activeFolderId: props.activeFolderId,
    focusedNodeId,
    focusedRowIndex,
    placement: reviewScroll.placement,
    scrollContainerRef,
    scrollNodeId: reviewScroll.scrollNodeId,
    visibleRowsLength: visibleRows.length
  });

  return renderWorkspaceTopicTreeShell({
    activeFolderId: props.creationParentNodeId ?? props.activeFolderId,
    collapsibleNodeIds,
    collapsedNodeIds,
    contentSort,
    ...definedProps({ emptyState: props.emptyState }),
    focusedNodeId,
    hasCollapsedNodes: collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId)),
    ...definedProps({ headerDescription: props.headerDescription }),
    interaction,
    nodesById: props.nodesById,
    ...definedProps({ onFocusEditor: props.onFocusEditor }),
    scrollContainerRef,
    scrollPlacement: reviewScroll.placement,
    scrollTargetNodeId: reviewScroll.scrollNodeId,
    searchQuery,
    setCollapsedNodeIds,
    onToggleDismissedTopicsVisibility: dismissedTopicVisibility.toggleDismissedTopicsVisibility,
    setSearchQuery,
    t,
    ...definedProps({ showCreateTopic: props.showCreateTopic }),
    topicFocusAvailable: props.topicFocusAvailable !== false,
    viewHideDismissedTopics: props.topicFocusAvailable !== false && dismissedTopicVisibility.viewHideDismissedTopics,
    visibleRows,
    ...definedProps({ tabStopNodeId: resolveWorkspaceTopicTreeTabStopNodeId(Boolean(props.onFocusEditor), focusedNodeId, visibleRows) })
  });
}, areWorkspaceTopicTreePropsEqual);
