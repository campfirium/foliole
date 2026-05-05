import { useMemo } from 'react';

import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import { useNodeListState, useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { buildNodeTree } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';

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

function useWorkspaceTopicTreeState(itemIds: string[], nodesById: WorkspaceListNodesById) {
  return useMemo(() => buildNodeTree(itemIds, nodesById), [itemIds, nodesById]);
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

export function WorkspaceTopicTree({
  activeFolderId,
  activeNodeId,
  emptyStateDescription = 'Select a folder with items, or add an item inside the current folder.',
  emptyStateTitle = 'No items in this folder',
  itemIds,
  nodesById,
  onOpenMoveToNode,
  onSelectNode
}: WorkspaceTopicTreeProps) {
  const tree = useWorkspaceTopicTreeState(itemIds, nodesById);
  const { collapsedNodeIds, setCollapsedNodeIds } = useWorkspaceTopicTreeCollapse(
    activeFolderId,
    activeNodeId,
    tree.rows,
    tree.parentById
  );
  const { collapsibleNodeIds, searchQuery, setSearchQuery, visibleRows } = useWorkspaceTopicTreeRows(
    tree.rows,
    collapsedNodeIds
  );
  const hasCollapsedNodes =
    collapsibleNodeIds.length > 0 && collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));
  const interaction = useWorkspaceTopicTreeInteraction({
    activeFolderId,
    activeNodeId,
    collapsedNodeIds,
    itemIds,
    nodesById,
    onOpenMoveToNode,
    onSelectNode
  });

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <WorkspaceTopicTreeHeader
        hasCollapsibleNodes={collapsibleNodeIds.length > 0}
        hasCollapsedNodes={hasCollapsedNodes}
        onCreateTopic={() => interaction.createChildNode(activeFolderId, '', 'topic')}
        onToggleCollapseAll={() =>
          setCollapsedNodeIds(hasCollapsedNodes ? new Set() : new Set(collapsibleNodeIds))
        }
        onSearchQueryChange={setSearchQuery}
        searchQuery={searchQuery}
      />
      {renderWorkspaceTopicTreeBody({
        activeNodeId,
        collapsedNodeIds,
        contextMenu: interaction.contextMenu,
        emptyStateDescription,
        emptyStateTitle,
        nodesById,
        onSelectNode: interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, setCollapsedNodeIds),
        visibleRows
      })}
      {interaction.topicTreeMenu}
    </aside>
  );
}
