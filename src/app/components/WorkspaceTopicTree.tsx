import { memo, useMemo, useRef } from 'react';

import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import type { NodeListState } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useDismissedTopicVisibility } from './useDismissedTopicVisibility';
import { useWorkspaceTopicTreeContentSort } from './useWorkspaceTopicTreeContentSort';
import { useWorkspaceTopicTreeActions } from './workspaceTopicTreeActions';
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
import { renderWorkspaceTopicTreeMenu } from './workspaceTopicTreeMenuRender';
import { areWorkspaceTopicTreePropsEqual, useWorkspaceTopicTreeRenderDiagnostic } from './workspaceTopicTreeRenderDiagnostic';
import { resolveWorkspaceTopicTreeReviewScroll } from './workspaceTopicTreeReviewScroll';
import { useWorkspaceTopicTreeSelection } from './workspaceTopicTreeSelection';
import { renderWorkspaceTopicTreeShell } from './WorkspaceTopicTreeShell';

type CreateTopicTreeNode = ReturnType<typeof useWorkspaceTopicTreeActions>['createChildNode'];

export interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  childrenByParent?: TopicChildrenByParent;
  forceVisibleNodeId?: string | null;
  headerDescription?: string;
  itemIds: string[];
  preserveItemOrder?: boolean;
  nodesById: WorkspaceListNodesById;
  onCreateChildNode?: CreateTopicTreeNode;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  showCreateTopic?: boolean;
}

interface WorkspaceTopicTreeInteractionArgs {
  activeFolderId: string;
  activeNodeId: string | null;
  isManualSort: boolean;
  nodesById: WorkspaceListNodesById;
  onCreateChildNode?: CreateTopicTreeNode;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  rowIds: string[];
}

export function useWorkspaceTopicTreeInteraction(args: WorkspaceTopicTreeInteractionArgs) {
  const actions = useWorkspaceTopicTreeActions();
  const createChildNode = args.onCreateChildNode ?? actions.createChildNode;
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
    createChildNode,
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
      onCreateChildNode: createChildNode,
      onOpenMoveToNode: args.onOpenMoveToNode,
      ...definedProps({ onOpenPostponeTopicPanel: args.onOpenPostponeTopicPanel }),
      topicTreeState
    })
  };
}

function useWorkspaceTopicTreeData(props: WorkspaceTopicTreeProps) {
  const storedManualChildOrder = props.nodesById[props.activeFolderId]?.manualChildOrder ?? null;
  const manualChildOrder = props.preserveItemOrder ? props.itemIds : storedManualChildOrder;
  const contentSort = useWorkspaceTopicTreeContentSort(
    props.activeFolderId,
    Boolean(props.preserveItemOrder || storedManualChildOrder?.length)
  );
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
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
    nodeViewById,
    nodesById: props.nodesById,
    sortRefreshVersion: contentSort.sortRefreshVersion,
    sort,
    hideDismissedTopics: dismissedTopicVisibility.viewHideDismissedTopics,
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

export const WorkspaceTopicTree = memo(function WorkspaceTopicTree(props: WorkspaceTopicTreeProps) {
  const t = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const treeData = useWorkspaceTopicTreeData(props);
  useWorkspaceTopicTreeRenderDiagnostic(props, treeData);
  const { contentSort, lazyModel, nodeViewById, dismissedTopicVisibility } = treeData;
  const { collapsedNodeIds, collapsibleNodeIds, rows: visibleRows, searchQuery, setCollapsedNodeIds, setSearchQuery } = lazyModel;
  const focusedNodeId = resolveWorkspaceTopicTreeFocusNodeId({
    activeNodeId: props.activeNodeId,
    nodeViewState: props.activeNodeId ? nodeViewById[props.activeNodeId] : undefined,
    nodesById: props.nodesById,
    rows: visibleRows
  });
  const hasCollapsedNodes = collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const { focusedRowIndex, reviewScroll } = resolveWorkspaceTopicTreeScrollState(props, focusedNodeId, visibleRows);
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId: props.activeFolderId,
    activeNodeId: props.activeNodeId,
    isManualSort: contentSort.sort.key === 'manual',
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
    activeFolderId: props.activeFolderId,
    collapsibleNodeIds,
    collapsedNodeIds,
    contentSort,
    focusedNodeId,
    hasCollapsedNodes,
    ...definedProps({ headerDescription: props.headerDescription }),
    interaction,
    nodesById: props.nodesById,
    scrollContainerRef,
    scrollPlacement: reviewScroll.placement,
    scrollTargetNodeId: reviewScroll.scrollNodeId,
    searchQuery,
    setCollapsedNodeIds,
    onToggleDismissedTopicsVisibility: dismissedTopicVisibility.toggleDismissedTopicsVisibility,
    setSearchQuery,
    t,
    ...definedProps({ showCreateTopic: props.showCreateTopic }),
    viewHideDismissedTopics: dismissedTopicVisibility.viewHideDismissedTopics,
    visibleRows
  });
}, areWorkspaceTopicTreePropsEqual);
