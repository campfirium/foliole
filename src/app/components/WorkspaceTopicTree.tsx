import { useMemo } from 'react';

import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import { useNodeListState, useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { buildNodeTree } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort, sortWorkspaceContentNodeIds } from './workspaceContentSort';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import {
  renderWorkspaceTopicTreeBody,
  toggleCollapsedNode,
  useWorkspaceTopicTreeCollapse,
  useWorkspaceTopicTreeRows
} from './workspaceTopicTreeContent';
import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';

interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
  onSelectNode: (nodeId: string) => void;
}

function useWorkspaceTopicTreeState(
  itemIds: string[],
  nodesById: WorkspaceListNodesById,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort'],
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById']
) {
  const contentSort = normalizeWorkspaceContentSort(sort, ['savedAt', 'lastOpenedAt', 'name']);
  const sortedItemIds = useMemo(
    () => sortWorkspaceContentNodeIds(itemIds, nodesById, contentSort, nodeViewById),
    [contentSort, itemIds, nodeViewById, nodesById]
  );
  return useMemo(() => buildNodeTree(sortedItemIds, nodesById), [nodesById, sortedItemIds]);
}

function useWorkspaceTopicTreeActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    returnNode: useWorkspaceStore((state) => state.relearnNode)
  };
}

function useWorkspaceTopicTreeInteraction(args: {
  activeFolderId: string;
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: WorkspaceLayoutProps['onOpenMoveToNode'];
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

  return {
    ...actions,
    contextMenu,
    handleSelectNode,
    topicTreeState,
    topicTreeMenu: (
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
    )
  };
}

export function WorkspaceTopicTree(props: WorkspaceTopicTreeProps) {
  const contentSort = useWorkspaceContentSort();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const tree = useWorkspaceTopicTreeState(props.itemIds, props.nodesById, contentSort.sort, nodeViewById);
  const { collapsedNodeIds, setCollapsedNodeIds } = useWorkspaceTopicTreeCollapse(
    props.activeFolderId,
    props.activeNodeId,
    tree.rows,
    tree.parentById
  );
  const { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows } = useWorkspaceTopicTreeRows(
    tree.rows,
    collapsedNodeIds
  );
  const hasCollapsedNodes = collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId: props.activeFolderId,
    activeNodeId: props.activeNodeId,
    collapsedNodeIds,
    itemIds: props.itemIds,
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onSelectNode: props.onSelectNode
  });
  const headerArgs = buildWorkspaceTopicTreeHeaderArgs({
    activeFolderId: props.activeFolderId,
    collapsibleNodeIds,
    contentSort,
    hasCollapsedNodes,
    interaction,
    searchQuery,
    setCollapsedNodeIds,
    setSearchQuery
  });

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      {renderWorkspaceTopicTreeHeader(headerArgs)}
      {renderWorkspaceTopicTreeBody({
        activeNodeId: props.activeNodeId,
        collapsedNodeIds,
        contextMenu: interaction.contextMenu,
        emptyStateDescription: props.emptyStateDescription ?? 'Add a topic to get started.',
        emptyStateTitle: props.emptyStateTitle ?? 'No topics in this folder',
        nodesById: props.nodesById,
        onSelectNode: interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, setCollapsedNodeIds),
        visibleRows
      })}
      {interaction.topicTreeMenu}
    </aside>
  );
}

function buildWorkspaceTopicTreeHeaderArgs(args: {
  activeFolderId: string;
  collapsibleNodeIds: string[];
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  hasCollapsedNodes: boolean;
  interaction: ReturnType<typeof useWorkspaceTopicTreeInteraction>;
  searchQuery: string;
  setCollapsedNodeIds: ReturnType<typeof useWorkspaceTopicTreeCollapse>['setCollapsedNodeIds'];
  setSearchQuery: (value: string) => void;
}) {
  return {
    ...args,
    contentSort: {
      ...args.contentSort,
      sort: normalizeWorkspaceContentSort(args.contentSort.sort, ['savedAt', 'lastOpenedAt', 'name'])
    }
  };
}

function renderWorkspaceTopicTreeHeader(args: {
  activeFolderId: string;
  collapsibleNodeIds: string[];
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  hasCollapsedNodes: boolean;
  interaction: ReturnType<typeof useWorkspaceTopicTreeInteraction>;
  searchQuery: string;
  setCollapsedNodeIds: ReturnType<typeof useWorkspaceTopicTreeCollapse>['setCollapsedNodeIds'];
  setSearchQuery: (value: string) => void;
}) {
  return (
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes={args.collapsibleNodeIds.length > 0}
      hasCollapsedNodes={args.hasCollapsedNodes}
      onChangeSortDirection={args.contentSort.setSortDirection}
      onChangeSortKey={args.contentSort.setSortKey}
      onCreateTopic={() => args.interaction.createChildNode(args.activeFolderId, '', 'topic')}
      onSearchQueryChange={args.setSearchQuery}
      onToggleCollapseAll={() =>
        args.setCollapsedNodeIds(args.hasCollapsedNodes ? new Set() : new Set(args.collapsibleNodeIds))
      }
      searchQuery={args.searchQuery}
      sortDirection={args.contentSort.sort.direction}
      sortKey={args.contentSort.sort.key}
    />
  );
}
