import { useMemo } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';
import type { CurrentViewTopicSnapshot } from '../currentViewTopicSnapshot';

import { FolderListViewItem, type FolderListItemLayout } from './FolderListViewItem';
import { FolderListViewLayout } from './FolderListViewLayout';
import { useFolderListViewState } from './useFolderListViewState';
import { WorkspaceTopicTreeCurrentViewActions } from './WorkspaceTopicTreeCurrentViewActions';

interface FolderListViewProps {
  folderNodeId?: string;
  folderTitle?: string;
  nodeOrder?: string[];
  nodes?: Node[];
  nodeViewById?: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, Node>;
  onChangeSearchQuery?: (searchQuery: string) => void;
  onChangeSortDirection?: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey?: (sortKey: FolderListSortKey) => void;
  onOpenMoveToNode?: (sourceSnapshot?: CurrentViewTopicSnapshot[]) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  searchQuery?: string;
  emptyState?: {
    description: string;
    title: string;
  };
  regionLabel?: string;
  showEmbeddedHeader?: boolean;
  itemLayout?: FolderListItemLayout;
  sortDirection?: FolderListSortDirection;
  sortKey?: FolderListSortKey;
  trashedNodeIds?: string[];
}

function getDirectChildNodes(
  folderNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: readonly string[]
) {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === folderNodeId && !trashedNodeIds.includes(node.id)));
}

const DEFAULT_EMPTY_STATE = {
  description: 'Topics and folders will appear here after you add them to this folder.',
  title: 'This folder is empty'
} as const;

function resolveFolderTitle(folderTitle: string | undefined, folderNodeId: string | undefined, nodesById: Record<string, Node>) {
  if (folderTitle && folderTitle.trim()) {
    return folderTitle;
  }
  if (folderNodeId) {
    return nodesById[folderNodeId]?.title || 'Folder';
  }
  return 'Folder';
}

function resolveListedNodes(props: FolderListViewProps) {
  if (props.nodes) {
    return props.nodes;
  }
  if (!props.folderNodeId || !props.nodeOrder) {
    return [];
  }
  return getDirectChildNodes(props.folderNodeId, props.nodeOrder, props.nodesById, props.trashedNodeIds ?? []);
}

function buildFolderListEmptyState(
  resolvedEmptyState: FolderListViewProps['emptyState'],
  searchQuery: string
) {
  if (searchQuery.trim()) {
    return {
      description: 'Try a different keyword for this folder.',
      title: 'No matching content'
    };
  }

  return resolvedEmptyState ?? DEFAULT_EMPTY_STATE;
}

function buildCurrentViewTopicSnapshots(filteredNodes: Node[]): CurrentViewTopicSnapshot[] {
  return filteredNodes
    .filter((node) => node.kind === 'topic')
    .map((node) => ({
      ...(node.anchorLink !== undefined ? { anchorLink: node.anchorLink } : {}),
      id: node.id,
      kind: 'topic',
      parentNodeId: node.parentNodeId
    }));
}

function buildFolderListRebuildKey(props: FolderListViewProps, listedNodes: Node[]) {
  const scopeKey = props.folderNodeId ?? props.regionLabel ?? 'custom';
  const membershipKey = listedNodes.map((node) => node.id).join('\u0000');
  return `${scopeKey}\u0000${membershipKey}`;
}

function useResolvedFolderListState(props: FolderListViewProps) {
  const storeNodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const nodeViewById = props.nodeViewById ?? storeNodeViewById;
  const listedNodes = useMemo(
    () => resolveListedNodes(props),
    [
      props.emptyState,
      props.folderNodeId,
      props.nodeOrder,
      props.nodes,
      props.nodesById,
      props.onSelectNode,
      props.regionLabel,
      props.trashedNodeIds
    ]
  );
  const state = useFolderListViewState(
    listedNodes,
    nodeViewById,
    props.searchQuery,
    props.sortKey,
    props.sortDirection,
    props.onChangeSearchQuery,
    props.onChangeSortKey,
    props.onChangeSortDirection,
    DEFAULT_FOLDER_LIST_SORT_KEY,
    buildFolderListRebuildKey(props, listedNodes)
  );

  return {
    nodeViewById,
    resolvedFolderTitle: resolveFolderTitle(props.folderTitle, props.folderNodeId, props.nodesById),
    resolvedEmptyState: buildFolderListEmptyState(props.emptyState ?? DEFAULT_EMPTY_STATE, state.searchQuery),
    state
  };
}

export function FolderListView(props: FolderListViewProps) {
  const { nodeViewById, resolvedEmptyState, resolvedFolderTitle, state } = useResolvedFolderListState(props);
  const deleteNodes = useWorkspaceStore((storeState) => storeState.deleteNodes);
  const headerMode = props.showEmbeddedHeader === false ? 'hidden' : 'full';
  const currentViewActions = props.onOpenMoveToNode ? (
    <WorkspaceTopicTreeCurrentViewActions
      deleteNodes={deleteNodes}
      nodesById={props.nodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      topicSnapshots={buildCurrentViewTopicSnapshots(state.filteredNodes)}
      trashedNodeIds={props.trashedNodeIds ?? []}
    />
  ) : null;

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label={props.regionLabel ?? 'Folder list view'} className="mx-auto flex w-full flex-1 flex-col">
        <FolderListViewLayout
          currentEmptyState={resolvedEmptyState}
          currentViewActions={currentViewActions}
          filteredNodes={state.filteredNodes}
          folderTitle={resolvedFolderTitle}
          headerMode={headerMode}
          itemCountLabel={state.itemCountLabel}
          onChangeSearchQuery={state.setSearchQuery}
          onChangeSortDirection={state.updateSortDirection}
          onChangeSortKey={state.updateSortKey}
          onRenderItem={(node) => {
            const nodeViewState = nodeViewById[node.id];
            return (
              <FolderListViewItem
                itemLayout={props.itemLayout ?? 'default'}
                key={node.id}
                node={node}
                {...(nodeViewState !== undefined ? { nodeViewState } : {})}
                onSelectNode={props.onSelectNode}
                {...(props.onSelectNodePath ? { onSelectNodePath: props.onSelectNodePath } : {})}
                nodesById={props.nodesById}
                sortKey={state.sortKey}
              />
            );
          }}
          searchQuery={state.searchQuery}
          searchResultLabel={state.searchResultLabel}
          sortDirection={state.sortDirection}
          sortKey={state.sortKey}
        />
      </section>
    </div>
  );
}
