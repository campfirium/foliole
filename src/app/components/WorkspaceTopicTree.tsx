import { useMemo, useRef } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import type { NodeListState } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { useDismissedTopicVisibility } from './useDismissedTopicVisibility';
import {
  resolveWorkspaceTopicTreeFocusNodeId,
  useWorkspaceTopicTreeAutoScroll
} from './workspaceTopicTreeFocus';
import {
  useWorkspaceTopicTreeLazyModel
} from './workspaceTopicTreeLazyModel';
import {
  buildTopicChildrenByParent,
  type TopicChildrenByParent
} from './workspaceTopicTreeLazyRows';
import { WorkspaceTopicTreeMenu } from './WorkspaceTopicTreeMenu';
import { resolveWorkspaceTopicTreeReviewScroll } from './workspaceTopicTreeReviewScroll';
import { useWorkspaceTopicTreeSelection } from './workspaceTopicTreeSelection';
import { renderWorkspaceTopicTreeShell } from './WorkspaceTopicTreeShell';

export interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  childrenByParent?: TopicChildrenByParent;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  forceVisibleNodeId?: string | null;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onSelectNode: (nodeId: string) => void;
}

export function useWorkspaceTopicTreeActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    moveNodes: useWorkspaceStore((state) => state.moveNodes),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    returnNode: useWorkspaceStore((state) => state.relearnNode),
    setNodeSequentialReading: useWorkspaceStore((state) => state.setNodeSequentialReading),
    updateNodePriority: useWorkspaceStore((state) => state.updateNodePriority),
    updateNodeShortTerm: useWorkspaceStore((state) => state.updateNodeShortTerm),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle)
  };
}

function useWorkspaceTopicTreeDrag(args: {
  itemIds: string[];
  moveNodes: ReturnType<typeof useWorkspaceTopicTreeActions>['moveNodes'];
  nodesById: WorkspaceListNodesById;
  selectedNodeIds: string[];
}) {
  return useNodeListDragController({
    disableRootDrop: true,
    isTrashViewOpen: false,
    moveNodes: args.moveNodes,
    nodesById: args.nodesById,
    noteRowIds: args.itemIds,
    selectedNodeIds: args.selectedNodeIds
  });
}

export function useWorkspaceTopicTreeInteraction(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onSelectNode: (nodeId: string) => void;
  rowIds: string[];
}) {
  const actions = useWorkspaceTopicTreeActions();
  const selection = useWorkspaceTopicTreeSelection({
    activeNodeId: args.activeNodeId,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    rowIds: args.rowIds
  });
  const topicTreeState = useMemo<NodeListState>(() => ({
    noteParentById: {},
    noteRowIds: args.rowIds,
    noteRows: [],
    noteRowsAll: [],
    selectedNodeIds: selection.selectedNodeIds,
    selectionAnchorNodeId: selection.selectionAnchorNodeId,
    setSelectedNodeIds: selection.setSelectedNodeIds,
    setSelectionAnchorNodeId: selection.setSelectionAnchorNodeId,
    trashRowIds: [],
    trashRows: [],
    trashRowsAll: [],
    virtualRowIds: [],
    virtualRows: [],
    virtualRowsAll: []
  }), [args.rowIds, selection]);
  const contextMenu = useNodeListContextMenu(selection.selectedNodeIds, []);
  const drag = useWorkspaceTopicTreeDrag({
    itemIds: args.rowIds,
    moveNodes: actions.moveNodes,
    nodesById: args.nodesById,
    selectedNodeIds: selection.selectedNodeIds
  });

  return {
    ...actions,
    contextMenu,
    drag,
    handleSelectNode: selection.handleSelectNode,
    topicTreeState,
    topicTreeMenu: (
      <WorkspaceTopicTreeMenu
        actions={actions}
        activeFolderId={args.activeFolderId}
        contextMenu={contextMenu}
        handleSelectNode={selection.handleSelectNode}
        nodesById={args.nodesById}
        onOpenMoveToNode={args.onOpenMoveToNode}
        topicTreeState={topicTreeState}
      />
    )
  };
}

function useWorkspaceTopicTreeData(props: WorkspaceTopicTreeProps) {
  const contentSort = useWorkspaceContentSort();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const dismissedTopicVisibility = useDismissedTopicVisibility();
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
    nodeViewById,
    nodesById: props.nodesById,
    sortRefreshVersion: contentSort.sortRefreshVersion,
    sort: contentSort.sort,
    hideDismissedTopics: dismissedTopicVisibility.viewHideDismissedTopics,
    ...definedProps({ forceVisibleNodeId: props.forceVisibleNodeId })
  });
  return { contentSort, lazyModel, nodeViewById, dismissedTopicVisibility };
}

export function WorkspaceTopicTree(props: WorkspaceTopicTreeProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { contentSort, lazyModel, nodeViewById, dismissedTopicVisibility } = useWorkspaceTopicTreeData(props);
  const { collapsedNodeIds, collapsibleNodeIds, rows: visibleRows, searchQuery, setCollapsedNodeIds, setSearchQuery } = lazyModel;
  const focusedNodeId = resolveWorkspaceTopicTreeFocusNodeId({
    activeNodeId: props.activeNodeId,
    nodeViewState: props.activeNodeId ? nodeViewById[props.activeNodeId] : undefined,
    nodesById: props.nodesById,
    rows: visibleRows
  });
  const hasCollapsedNodes = collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const focusedRowIndex = focusedNodeId ? visibleRows.findIndex((row) => row.node.id === focusedNodeId) : -1;
  const reviewScroll = resolveWorkspaceTopicTreeReviewScroll({
    focusedNodeId,
    forceVisibleNodeId: props.forceVisibleNodeId,
    nodesById: props.nodesById,
    rows: visibleRows
  });
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId: props.activeFolderId,
    activeNodeId: focusedNodeId,
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
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
    activeFolderId: props.activeFolderId,
    collapsibleNodeIds,
    collapsedNodeIds,
    contentSort,
    focusedNodeId,
    hasCollapsedNodes,
    interaction,
    nodesById: props.nodesById,
    scrollContainerRef,
    scrollPlacement: reviewScroll.placement,
    scrollTargetNodeId: reviewScroll.scrollNodeId,
    searchQuery,
    setCollapsedNodeIds,
    onToggleDismissedTopicsVisibility: dismissedTopicVisibility.toggleDismissedTopicsVisibility,
    setSearchQuery,
    viewHideDismissedTopics: dismissedTopicVisibility.viewHideDismissedTopics,
    visibleRows,
    ...(props.emptyStateDescription !== undefined
      ? { emptyStateDescription: props.emptyStateDescription }
      : {}),
    ...(props.emptyStateTitle !== undefined ? { emptyStateTitle: props.emptyStateTitle } : {})
  });
}
