import { useMemo, useRef } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import type { NodeListState, NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

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
import { useWorkspaceTopicTreeSelection } from './workspaceTopicTreeSelection';
import { renderWorkspaceTopicTreeShell } from './WorkspaceTopicTreeShell';

export interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  childrenByParent?: TopicChildrenByParent;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onSelectNode: (nodeId: string) => void;
}

function useWorkspaceTopicTreeActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    moveNodes: useWorkspaceStore((state) => state.moveNodes),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    returnNode: useWorkspaceStore((state) => state.relearnNode),
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
    topicTreeMenu: renderWorkspaceTopicTreeMenu(args, actions, contextMenu, selection.handleSelectNode, topicTreeState)
  };
}

function renderWorkspaceTopicTreeMenu(
  args: Parameters<typeof useWorkspaceTopicTreeInteraction>[0],
  actions: ReturnType<typeof useWorkspaceTopicTreeActions>,
  contextMenu: ReturnType<typeof useNodeListContextMenu>,
  handleSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void,
  topicTreeState: NodeListState
) {
  return (
    <NodeListTreeMenu
      contextMenu={contextMenu}
      createChildNode={actions.createChildNode}
      createGlobalNode={(content = '', kind = 'topic') => actions.createChildNode(args.activeFolderId, content, kind)}
      createVirtualNode={actions.createVirtualNode}
      deleteNodes={actions.deleteNodes}
      deleteNodesPermanently={actions.deleteNodesPermanently}
      dismissNode={actions.dismissNode}
      isVirtualViewOpen={false}
      nodesById={args.nodesById}
      onOpenMoveToNode={args.onOpenMoveToNode}
      onSelect={handleSelectNode}
      restoreNode={actions.restoreNode}
      returnNode={actions.returnNode}
      state={topicTreeState}
    />
  );
}

function useWorkspaceTopicTreeData(props: WorkspaceTopicTreeProps) {
  const contentSort = useWorkspaceContentSort();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
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
    sort: contentSort.sort
  });
  return { contentSort, lazyModel, nodeViewById };
}

export function WorkspaceTopicTree(props: WorkspaceTopicTreeProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { contentSort, lazyModel, nodeViewById } = useWorkspaceTopicTreeData(props);
  const { collapsedNodeIds, collapsibleNodeIds, rows: visibleRows, searchQuery, setCollapsedNodeIds, setSearchQuery } = lazyModel;
  const focusedNodeId = resolveWorkspaceTopicTreeFocusNodeId({
    activeNodeId: props.activeNodeId,
    nodeViewState: props.activeNodeId ? nodeViewById[props.activeNodeId] : undefined,
    nodesById: props.nodesById,
    rows: visibleRows
  });
  const hasCollapsedNodes = collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const focusedRowIndex = focusedNodeId ? visibleRows.findIndex((row) => row.node.id === focusedNodeId) : -1;
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
    scrollContainerRef,
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
    searchQuery,
    setCollapsedNodeIds,
    setSearchQuery,
    visibleRows,
    ...(props.emptyStateDescription !== undefined
      ? { emptyStateDescription: props.emptyStateDescription }
      : {}),
    ...(props.emptyStateTitle !== undefined ? { emptyStateTitle: props.emptyStateTitle } : {})
  });
}
