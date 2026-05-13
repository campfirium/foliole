import { useMemo, useRef } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import { useNodeListState, useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { useNodeTreeActiveItemScroll } from '../../features/nodes/components/useNodeTreeActiveItemScroll';
import { buildNodeTree } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort, sortWorkspaceContentNodeIds } from './workspaceContentSort';
import {
  renderWorkspaceTopicTreeBody,
  toggleCollapsedNode,
  useWorkspaceTopicTreeCollapse,
  useWorkspaceTopicTreeRows
} from './workspaceTopicTreeContent';
import { WorkspaceTopicTreeHeaderBridge } from './WorkspaceTopicTreeHeaderBridge';

interface WorkspaceTopicTreeProps {
  activeFolderId: string;
  activeNodeId: string | null;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onOpenMoveToNode: () => void;
  onSelectNode: (nodeId: string) => void;
}

function useWorkspaceTopicTreeState(
  itemIds: string[],
  nodesById: WorkspaceListNodesById,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort'],
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById']
) {
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

function useWorkspaceTopicTreeCollapseState(props: WorkspaceTopicTreeProps, tree: ReturnType<typeof useWorkspaceTopicTreeState>['tree']) {
  return useWorkspaceTopicTreeCollapse(
    props.activeFolderId,
    props.activeNodeId,
    tree.rows,
    tree.parentById
  );
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

function useWorkspaceTopicTreeInteraction(args: {
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
  const { collapsedNodeIds, setCollapsedNodeIds } = useWorkspaceTopicTreeCollapseState(props, tree);
  const { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows } = useWorkspaceTopicTreeRows(
    tree.rows,
    collapsedNodeIds
  );
  const hasCollapsedNodes = collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId: props.activeFolderId,
    activeNodeId: props.activeNodeId,
    collapsedNodeIds,
    itemIds: sortedItemIds,
    nodesById: props.nodesById,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onSelectNode: props.onSelectNode
  });

  useNodeTreeActiveItemScroll({
    activeNodeId: props.activeNodeId,
    scopeKey: `${props.activeFolderId}:${visibleRows.length}`,
    scrollContainerRef
  });

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <WorkspaceTopicTreeHeaderBridge
        activeFolderId={props.activeFolderId}
        collapsibleNodeIds={collapsibleNodeIds}
        contentSort={contentSort}
        hasCollapsedNodes={hasCollapsedNodes}
        onCreateTopic={(parentNodeId) => interaction.createChildNode(parentNodeId, '', 'topic')}
        searchQuery={searchQuery}
        setCollapsedNodeIds={setCollapsedNodeIds}
        setSearchQuery={setSearchQuery}
      />
      {renderWorkspaceTopicTreeBody({
        activeNodeId: props.activeNodeId,
        collapsedNodeIds,
        contextMenu: interaction.contextMenu,
        drag: interaction.drag,
        emptyStateDescription: props.emptyStateDescription ?? 'Add a topic to get started.',
        emptyStateTitle: props.emptyStateTitle ?? 'No topics in this folder',
        nodesById: props.nodesById,
        onRenameNode: interaction.updateNodeTitle,
        onSelectNode: interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, setCollapsedNodeIds),
        scrollContainerRef,
        selectedNodeIds: interaction.topicTreeState.selectedNodeIds,
        visibleRows
      })}
      {interaction.topicTreeMenu}
    </aside>
  );
}
