import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import type { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import type { useWorkspaceTopicTreeInteraction } from './WorkspaceTopicTree';
import {
  renderWorkspaceTopicTreeBody,
  toggleCollapsedNode
} from './workspaceTopicTreeContent';
import { WorkspaceTopicTreeHeaderBridge } from './WorkspaceTopicTreeHeaderBridge';
import type { WorkspaceTopicTreeScrollPlacement } from './WorkspaceTopicTreeRows';

export function renderWorkspaceTopicTreeShell(args: {
  activeFolderId: string;
  collapsibleNodeIds: string[];
  collapsedNodeIds: ReadonlySet<string>;
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  focusedNodeId: string | null;
  hasCollapsedNodes: boolean;
  headerDescription?: string;
  interaction: ReturnType<typeof useWorkspaceTopicTreeInteraction>;
  nodesById: WorkspaceListNodesById;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollPlacement?: WorkspaceTopicTreeScrollPlacement;
  searchQuery: string;
  setCollapsedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  onToggleDismissedTopicsVisibility: () => void;
  setSearchQuery: (value: string) => void;
  t: Translate;
  scrollTargetNodeId?: string | null;
  showCreateTopic?: boolean;
  viewHideDismissedTopics: boolean;
  visibleRows: NodeTreeRow[];
}) {
  return (
    <aside aria-label={args.t('desktop.workspace.currentFolderContents')} className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <WorkspaceTopicTreeHeaderBridge
        activeFolderId={args.activeFolderId}
        collapsibleNodeIds={args.collapsibleNodeIds}
        contentSort={args.contentSort}
        hasCollapsedNodes={args.hasCollapsedNodes}
        {...definedProps({ headerDescription: args.headerDescription })}
        onCreateTopic={(parentNodeId) => args.interaction.createChildNode(parentNodeId, '', 'topic')}
        onToggleDismissedTopicsVisibility={args.onToggleDismissedTopicsVisibility}
        searchQuery={args.searchQuery}
        setCollapsedNodeIds={args.setCollapsedNodeIds}
        setSearchQuery={args.setSearchQuery}
        {...definedProps({ showCreateTopic: args.showCreateTopic })}
        viewHideDismissedTopics={args.viewHideDismissedTopics}
      />
      {renderWorkspaceTopicTreeBody({
        activeNodeId: args.focusedNodeId,
        collapsedNodeIds: args.collapsedNodeIds,
        contextMenu: args.interaction.contextMenu,
        drag: args.interaction.drag,
        isManualSort: args.contentSort.sort.key === 'manual',
        nodesById: args.nodesById,
        onRenameNode: args.interaction.updateNodeTitle,
        onSelectNode: args.interaction.handleSelectNode,
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, args.setCollapsedNodeIds),
        scrollContainerRef: args.scrollContainerRef,
        selectedNodeIds: args.interaction.topicTreeState.selectedNodeIds,
        visibleRows: args.visibleRows,
        ...definedProps({ scrollPlacement: args.scrollPlacement, scrollTargetNodeId: args.scrollTargetNodeId })
      })}
      {args.interaction.topicTreeMenu}
    </aside>
  );
}
