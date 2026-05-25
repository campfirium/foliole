import { useMemo, useRef } from 'react';

import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import type { NodeListState } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { useDismissedTopicVisibility } from './useDismissedTopicVisibility';
import { useWorkspaceTopicTreeDrag } from './workspaceTopicTreeDrag';
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
  forceVisibleNodeId?: string | null;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
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
    setFolderManualChildOrder: useWorkspaceStore((state) => state.setFolderManualChildOrder),
    updateNodePriority: useWorkspaceStore((state) => state.updateNodePriority),
    updateNodeShortTerm: useWorkspaceStore((state) => state.updateNodeShortTerm),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle)
  };
}

function renderWorkspaceTopicTreeMenu(args: {
  actions: ReturnType<typeof useWorkspaceTopicTreeActions>;
  activeFolderId: string;
  contextMenu: ReturnType<typeof useNodeListContextMenu>;
  handleSelectNode: ReturnType<typeof useWorkspaceTopicTreeSelection>['handleSelectNode'];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  topicTreeState: NodeListState;
}) {
  return (
    <WorkspaceTopicTreeMenu
      actions={args.actions}
      activeFolderId={args.activeFolderId}
      contextMenu={args.contextMenu}
      handleSelectNode={args.handleSelectNode}
      nodesById={args.nodesById}
      onOpenMoveToNode={args.onOpenMoveToNode}
      {...definedProps({ onOpenPostponeTopicPanel: args.onOpenPostponeTopicPanel })}
      topicTreeState={args.topicTreeState}
    />
  );
}

interface WorkspaceTopicTreeInteractionArgs {
  activeFolderId: string;
  activeNodeId: string | null;
  isManualSort: boolean;
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  rowIds: string[];
}

export function useWorkspaceTopicTreeInteraction(args: WorkspaceTopicTreeInteractionArgs) {
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
  const contextMenu = useNodeListContextMenu(args.nodesById, selection.selectedNodeIds, []);
  const drag = useWorkspaceTopicTreeDrag({
    activeFolderId: args.activeFolderId,
    itemIds: args.rowIds,
    isManualSort: args.isManualSort,
    moveNodes: actions.moveNodes,
    nodesById: args.nodesById,
    selectedNodeIds: selection.selectedNodeIds,
    ...definedProps({ setFolderManualChildOrder: actions.setFolderManualChildOrder })
  });

  return {
    ...actions,
    contextMenu,
    drag,
    handleSelectNode: selection.handleSelectNode,
    topicTreeState,
    topicTreeMenu: renderWorkspaceTopicTreeMenu({
      actions,
      activeFolderId: args.activeFolderId,
      contextMenu,
      handleSelectNode: selection.handleSelectNode,
      nodesById: args.nodesById,
      onOpenMoveToNode: args.onOpenMoveToNode,
      ...definedProps({ onOpenPostponeTopicPanel: args.onOpenPostponeTopicPanel }),
      topicTreeState
    })
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
    manualChildOrder: props.nodesById[props.activeFolderId]?.manualChildOrder ?? null,
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
    isManualSort: contentSort.sort.key === 'manual',
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
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
    visibleRows
  });
}
