import { type ReactNode, useMemo, useRef } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';
import type { CurrentViewTopicSnapshot } from '../currentViewTopicSnapshot';

import { renderFolderListItem } from './folderListItemRender';
import { resolveFolderManualChildOrder, resolveListedFolderNodes } from './folderListManualOrdering';
import { FolderListMouseGestureSurface } from './FolderListMouseGestureSurface';
import { FolderListNavigationOverlay, type FolderListNavigationOverlayProps } from './FolderListNavigationOverlay';
import type { FolderListItemLayout } from './FolderListViewItem';
import { FolderListViewLayout } from './FolderListViewLayout';
import { useFolderListSelection } from './useFolderListSelection';
import { useFolderListViewState } from './useFolderListViewState';
import { WorkspaceTopicTreeCurrentViewActions } from './WorkspaceTopicTreeCurrentViewActions';

interface FolderListViewProps {
  activeNodeId?: string | null | undefined;
  folderNodeId?: string;
  folderTitle?: string | undefined;
  nodeOrder?: string[];
  nodes?: Node[];
  nodeOpenStateById?: Record<string, { lastOpenedAt?: string | null } | undefined>;
  nodeViewById?: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, Node>;
  onChangeSearchQuery?: ((searchQuery: string) => void) | undefined;
  onChangeSortDirection?: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey?: (sortKey: FolderListSortKey) => void;
  onOpenMoveToNode?: (sourceSnapshot?: CurrentViewTopicSnapshot[]) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  searchQuery?: string;
  searchAriaLabel?: string | undefined;
  searchDescription?: string | undefined;
  searchPlaceholder?: string | undefined;
  searchReadOnly?: boolean;
  searchAction?: ReactNode;
  filterSearchResults?: boolean;
  emptyState?: { description: string; title: string } | undefined;
  currentViewActions?: ReactNode;
  regionLabel?: string;
  showEmbeddedHeader?: boolean;
  itemLayout?: FolderListItemLayout;
  mouseGesturesEnabled?: boolean;
  navigationOverlay?: FolderListNavigationOverlayProps;
  sortDirection?: FolderListSortDirection;
  sortKey?: FolderListSortKey;
  sortOptions?: { key: FolderListSortKey; label: string }[];
  trashedNodeIds?: string[];
}

function resolveFolderTitle(folderTitle: string | undefined, folderNodeId: string | undefined, nodesById: Record<string, Node>) {
  if (folderTitle && folderTitle.trim()) {
    return folderTitle;
  }
  if (folderNodeId) {
    return nodesById[folderNodeId]?.title || 'Folder';
  }
  return 'Folder';
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

function buildFolderListCurrentViewActions(props: FolderListViewProps, deleteNodes: (nodeIds: string[]) => void, filteredNodes: Node[]) {
  if (!props.onOpenMoveToNode) return null;
  return (
    <WorkspaceTopicTreeCurrentViewActions
      deleteNodes={deleteNodes}
      nodesById={props.nodesById}
      onOpenMoveToNode={props.onOpenMoveToNode}
      topicSnapshots={buildCurrentViewTopicSnapshots(filteredNodes)}
      trashedNodeIds={props.trashedNodeIds ?? []}
    />
  );
}

function useResolvedFolderListState(props: FolderListViewProps) {
  const storeNodeOpenStateById = useWorkspaceStore((state) => state.nodeOpenStateById);
  const nodeOpenStateById = props.nodeOpenStateById ?? storeNodeOpenStateById;
  const listedNodes = useMemo(
    () => resolveListedFolderNodes(props),
    [
      props.folderNodeId,
      props.nodeOrder,
      props.nodes,
      props.nodesById,
      props.onSelectNode,
      props.regionLabel,
      props.trashedNodeIds
    ]
  );
  const manualChildOrder = resolveFolderManualChildOrder(props);
  const state = useFolderListViewState({
    controlledSearchQuery: props.searchQuery,
    controlledSortDirection: props.sortDirection,
    controlledSortKey: props.sortKey,
    defaultSortKey: manualChildOrder?.length
      ? 'manual'
      : props.sortOptions?.[0]?.key ?? DEFAULT_FOLDER_LIST_SORT_KEY,
    filterSearchResults: props.filterSearchResults,
    listedNodes,
    nodeOpenStateById,
    listRebuildKey: buildFolderListRebuildKey(props, listedNodes),
    manualChildOrder: props.sortKey === 'manual'
      ? listedNodes.map((node) => node.id)
      : manualChildOrder,
    onChangeSearchQuery: props.onChangeSearchQuery,
    onChangeSortDirection: props.onChangeSortDirection,
    onChangeSortKey: props.onChangeSortKey
  });

  return {
    nodeOpenStateById,
    resolvedFolderTitle: resolveFolderTitle(props.folderTitle, props.folderNodeId, props.nodesById),
    state
  };
}

function renderFolderListViewItem(args: {
  node: Node;
  nodeOpenStateById: Record<string, { lastOpenedAt?: string | null } | undefined>;
  props: FolderListViewProps;
  selection: ReturnType<typeof useFolderListSelection>;
  state: ReturnType<typeof useResolvedFolderListState>['state'];
}) {
  return renderFolderListItem({
    activeNodeId: args.props.activeNodeId,
    isBulkSelectionActive: args.selection.selectedNodeIds.length > 1 && args.selection.selectedNodeIds.includes(args.node.id),
    itemLayout: args.props.itemLayout ?? 'default',
    node: args.node,
    nodeOpenStateById: args.nodeOpenStateById,
    nodesById: args.props.nodesById,
    onSelectNode: args.selection.handleSelectNode,
    ...(args.props.folderNodeId ? { folderNodeId: args.props.folderNodeId } : {}),
    ...(args.props.onSelectNodePath ? { onSelectNodePath: args.props.onSelectNodePath } : {}),
    sortKey: args.state.sortKey
  });
}

export function FolderListView(props: FolderListViewProps) {
  const t = useTranslation();
  const { nodeOpenStateById, resolvedFolderTitle, state } = useResolvedFolderListState(props);
  const deleteNodes = useWorkspaceStore((storeState) => storeState.deleteNodes);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const currentViewActions = buildFolderListCurrentViewActions(props, deleteNodes, state.filteredNodes);
  const selection = useFolderListSelection({
    activeNodeId: props.activeNodeId,
    filteredNodes: state.filteredNodes,
    onSelectNode: props.onSelectNode
  });
  const content = (
    <section aria-label={props.regionLabel ?? t('desktop.folderList.view')} className="mx-auto flex w-full flex-1 flex-col">
      <FolderListViewLayout
        currentViewActions={props.currentViewActions ?? currentViewActions}
        {...definedProps({ emptyState: props.emptyState })}
        filteredNodes={state.filteredNodes}
        folderTitle={resolvedFolderTitle}
        headerMode={props.showEmbeddedHeader === false ? 'hidden' : 'full'}
        itemCountLabel={state.itemCountLabel}
        navigationOverlay={props.navigationOverlay ? <FolderListNavigationOverlay {...props.navigationOverlay} /> : null}
        onChangeSearchQuery={state.setSearchQuery}
        onChangeSortDirection={state.updateSortDirection}
        onChangeSortKey={state.updateSortKey}
        onRenderItem={(node) => renderFolderListViewItem({
          node,
          nodeOpenStateById,
          props,
          selection,
          state
        })}
        searchQuery={state.searchQuery}
        {...definedProps({
          searchAction: props.searchAction,
          searchAriaLabel: props.searchAriaLabel,
          searchDescription: props.searchDescription,
          searchPlaceholder: props.searchPlaceholder,
          searchReadOnly: props.searchReadOnly
        })}
        searchResultLabel={state.searchResultLabel}
        scrollElementRef={scrollElementRef}
        sortDirection={state.sortDirection}
        sortKey={state.sortKey}
        sortOptions={props.sortOptions}
        t={t}
      />
    </section>
  );
  return props.mouseGesturesEnabled ? (
    <FolderListMouseGestureSurface surfaceRef={scrollElementRef}>{content}</FolderListMouseGestureSurface>
  ) : (
    <div ref={scrollElementRef} className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      {content}
    </div>
  );
}
