import type { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort } from './workspaceContentSort';
import type { useWorkspaceTopicTreeCollapse } from './workspaceTopicTreeContent';
import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';

interface WorkspaceTopicTreeHeaderBridgeProps {
  activeFolderId: string;
  collapsibleNodeIds: string[];
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  hasCollapsedNodes: boolean;
  onCreateTopic: (parentNodeId: string) => void;
  searchQuery: string;
  setCollapsedNodeIds: ReturnType<typeof useWorkspaceTopicTreeCollapse>['setCollapsedNodeIds'];
  setSearchQuery: (value: string) => void;
}

export function WorkspaceTopicTreeHeaderBridge(props: WorkspaceTopicTreeHeaderBridgeProps) {
  const contentSort = {
    ...props.contentSort,
    sort: normalizeWorkspaceContentSort(props.contentSort.sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name'])
  };
  return (
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes={props.collapsibleNodeIds.length > 0}
      hasCollapsedNodes={props.hasCollapsedNodes}
      onChangeSortDirection={contentSort.setSortDirection}
      onChangeSortKey={contentSort.setSortKey}
      onCreateTopic={() => props.onCreateTopic(props.activeFolderId)}
      onSearchQueryChange={props.setSearchQuery}
      onToggleCollapseAll={() =>
        props.setCollapsedNodeIds(props.hasCollapsedNodes ? new Set() : new Set(props.collapsibleNodeIds))
      }
      searchQuery={props.searchQuery}
      sortDirection={contentSort.sort.direction}
      sortKey={contentSort.sort.key}
    />
  );
}
