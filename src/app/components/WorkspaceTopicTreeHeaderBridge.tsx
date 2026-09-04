import type { Dispatch, SetStateAction } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import type { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { normalizeWorkspaceContentSort } from './workspaceContentSort';
import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';

interface WorkspaceTopicTreeHeaderBridgeProps {
  activeFolderId: string;
  collapsibleNodeIds: string[];
  contentSort: ReturnType<typeof useWorkspaceContentSort>;
  hasCollapsedNodes: boolean;
  headerDescription?: string;
  onCreateTopic: (parentNodeId: string) => void;
  onToggleDismissedTopicsVisibility: () => void;
  searchQuery: string;
  setCollapsedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSearchQuery: (value: string) => void;
  showCreateTopic?: boolean;
  topicFocusAvailable: boolean;
  viewHideDismissedTopics: boolean;
}

export function WorkspaceTopicTreeHeaderBridge(props: WorkspaceTopicTreeHeaderBridgeProps) {
  const contentSort = {
    ...props.contentSort,
    sort: normalizeWorkspaceContentSort(props.contentSort.sort, ['modifiedAt', 'lastOpenedAt', 'importedAt', 'name', 'manual'])
  };
  return (
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes={props.collapsibleNodeIds.length > 0}
      hasCollapsedNodes={props.hasCollapsedNodes}
      {...definedProps({ headerDescription: props.headerDescription })}
      onChangeSortDirection={contentSort.setSortDirection}
      onChangeSortKey={contentSort.setSortKey}
      onCreateTopic={() => props.onCreateTopic(props.activeFolderId)}
      onSearchQueryChange={props.setSearchQuery}
      onToggleDismissedTopicsVisibility={props.onToggleDismissedTopicsVisibility}
      onToggleCollapseAll={() =>
        props.setCollapsedNodeIds(props.hasCollapsedNodes ? new Set() : new Set(props.collapsibleNodeIds))
      }
      searchQuery={props.searchQuery}
      {...definedProps({ showCreateTopic: props.showCreateTopic })}
      topicFocusAvailable={props.topicFocusAvailable}
      sortDirection={contentSort.sort.direction}
      sortKey={contentSort.sort.key}
      viewHideDismissedTopics={props.viewHideDismissedTopics}
    />
  );
}
