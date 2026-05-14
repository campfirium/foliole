import type { RefObject } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import type { useWorkspaceTopicTreeInteraction } from './WorkspaceTopicTree';
import {
  renderWorkspaceTopicTreeBody,
  toggleCollapsedNode,
  useWorkspaceTopicTreeCollapse,
  useWorkspaceTopicTreeRows
} from './workspaceTopicTreeContent';
import { WorkspaceTopicTreeHeaderBridge } from './WorkspaceTopicTreeHeaderBridge';

export function renderWorkspaceTopicTreeShell(args: {
  activeFolderId: string;
  collapsibleNodeIds: string[];
  collapsedNodeIds: ReadonlySet<string>;
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  focusedNodeId: string | null;
  hasCollapsedNodes: boolean;
  interaction: ReturnType<typeof useWorkspaceTopicTreeInteraction>;
  nodesById: WorkspaceListNodesById;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  searchQuery: string;
  setCollapsedNodeIds: ReturnType<typeof useWorkspaceTopicTreeCollapse>['setCollapsedNodeIds'];
  setSearchQuery: (value: string) => void;
  visibleRows: ReturnType<typeof useWorkspaceTopicTreeRows>['visibleRows'];
}) {
  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <WorkspaceTopicTreeHeaderBridge
        activeFolderId={args.activeFolderId}
        collapsibleNodeIds={args.collapsibleNodeIds}
        contentSort={args.contentSort}
        hasCollapsedNodes={args.hasCollapsedNodes}
        onCreateTopic={(parentNodeId) => args.interaction.createChildNode(parentNodeId, '', 'topic')}
        searchQuery={args.searchQuery}
        setCollapsedNodeIds={args.setCollapsedNodeIds}
        setSearchQuery={args.setSearchQuery}
      />
      {renderWorkspaceTopicTreeBody({
        activeNodeId: args.focusedNodeId,
        collapsedNodeIds: args.collapsedNodeIds,
        contextMenu: args.interaction.contextMenu,
        drag: args.interaction.drag,
        emptyStateDescription: args.emptyStateDescription ?? 'Add a topic to get started.',
        emptyStateTitle: args.emptyStateTitle ?? 'No topics in this folder',
        nodesById: args.nodesById,
        onRenameNode: args.interaction.updateNodeTitle,
        onSelectNode: args.interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, args.setCollapsedNodeIds),
        scrollContainerRef: args.scrollContainerRef,
        selectedNodeIds: args.interaction.topicTreeState.selectedNodeIds,
        visibleRows: args.visibleRows
      })}
      {args.interaction.topicTreeMenu}
    </aside>
  );
}
