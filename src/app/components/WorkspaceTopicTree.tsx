import { useMemo, useRef } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import { useNodeListState, useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { buildNodeTree } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort, sortWorkspaceContentNodeIds } from './workspaceContentSort';
import { useWorkspaceTopicTreeRows } from './workspaceTopicTreeContent';
import {
  resolveWorkspaceTopicTreeFocusNodeId,
  useWorkspaceTopicTreeAutoScroll,
  useWorkspaceTopicTreeFocusState
} from './workspaceTopicTreeFocus';
import { renderWorkspaceTopicTreeShell } from './WorkspaceTopicTreeShell';

export interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onSelectNode: (nodeId: string) => void;
}

export interface WorkspaceTopicTreeState {
  sortedItemIds: string[];
  tree: ReturnType<typeof buildNodeTree>;
}

function useWorkspaceTopicTreeState(
  itemIds: string[],
  nodesById: WorkspaceListNodesById,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort'],
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById']
): WorkspaceTopicTreeState {
  const contentSort = normalizeWorkspaceContentSort(sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name']);
  const sortedItemIds = useMemo(
    () => sortWorkspaceContentNodeIds(itemIds, nodesById, contentSort, nodeViewById),
    [contentSort, itemIds, nodeViewById, nodesById]
  );
  const tree = useMemo(() => buildNodeTree(sortedItemIds, nodesById), [nodesById, sortedItemIds]);
  return { sortedItemIds, tree };
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
  collapsedNodeIds: ReadonlySet<string>;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const actions = useWorkspaceTopicTreeActions();
  const topicTreeState = useNodeListState(
    args.activeNodeId,
    true,
    args.itemIds,
    args.nodesById,
    null,
    args.collapsedNodeIds
  );
  const handleSelectNode = useNodeSelectionHandler({
    activeNodeId: args.activeNodeId,
    isSelectionScopeActive: true,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    onSelectTrashNode: () => undefined,
    selectedTrashNodeId: null,
    state: topicTreeState,
    trashedNodeIds: []
  });
  const contextMenu = useNodeListContextMenu(topicTreeState.selectedNodeIds, []);
  const drag = useWorkspaceTopicTreeDrag({
    itemIds: args.itemIds,
    moveNodes: actions.moveNodes,
    nodesById: args.nodesById,
    selectedNodeIds: topicTreeState.selectedNodeIds
  });

  return {
    ...actions,
    contextMenu,
    drag,
    handleSelectNode,
    topicTreeState,
    topicTreeMenu: renderWorkspaceTopicTreeMenu(args, actions, contextMenu, handleSelectNode, topicTreeState)
  };
}

function renderWorkspaceTopicTreeMenu(
  args: Parameters<typeof useWorkspaceTopicTreeInteraction>[0],
  actions: ReturnType<typeof useWorkspaceTopicTreeActions>,
  contextMenu: ReturnType<typeof useNodeListContextMenu>,
  handleSelectNode: ReturnType<typeof useNodeSelectionHandler>,
  topicTreeState: ReturnType<typeof useNodeListState>
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

export function WorkspaceTopicTree(props: WorkspaceTopicTreeProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const contentSort = useWorkspaceContentSort();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const { sortedItemIds, tree } = useWorkspaceTopicTreeState(props.itemIds, props.nodesById, contentSort.sort, nodeViewById);
  const { collapsedNodeIds, setCollapsedNodeIds } = useWorkspaceTopicTreeFocusState(props, tree, nodeViewById);
  const { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows } = useWorkspaceTopicTreeRows(
    tree.rows,
    collapsedNodeIds
  );
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
    collapsedNodeIds,
    itemIds: sortedItemIds,
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onSelectNode: props.onSelectNode
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
    emptyStateDescription: props.emptyStateDescription,
    emptyStateTitle: props.emptyStateTitle,
    focusedNodeId,
    hasCollapsedNodes,
    interaction,
    nodesById: props.nodesById,
    scrollContainerRef,
    searchQuery,
    setCollapsedNodeIds,
    setSearchQuery,
    visibleRows
  });
}
