import { type ReactNode, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';
import type { CurrentViewTopicSnapshot } from '../currentViewTopicSnapshot';

import { moveNodeIdBefore, resolveFolderManualChildOrder, resolveListedFolderNodes } from './folderListManualOrdering';
import { FolderListNavigationOverlay, type FolderListNavigationOverlayProps } from './FolderListNavigationOverlay';
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
  currentViewActions?: ReactNode;
  regionLabel?: string;
  showEmbeddedHeader?: boolean;
  itemLayout?: FolderListItemLayout;
  navigationOverlay?: FolderListNavigationOverlayProps;
  sortDirection?: FolderListSortDirection;
  sortKey?: FolderListSortKey;
  trashedNodeIds?: string[];
}

interface RenderFolderListItemArgs {
  canManualDrag: boolean;
  draggedNodeId: string | null;
  itemLayout: FolderListItemLayout;
  node: Node;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  setDraggedNodeId: (nodeId: string | null) => void;
  setFolderManualChildOrder?: (folderNodeId: string, childNodeIds: string[]) => void;
  folderNodeId?: string;
  childNodes: Node[];
  sortKey: FolderListSortKey;
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
  const storeNodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const nodeViewById = props.nodeViewById ?? storeNodeViewById;
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
  const state = useFolderListViewState({
    controlledSearchQuery: props.searchQuery,
    controlledSortDirection: props.sortDirection,
    controlledSortKey: props.sortKey,
    defaultSortKey: DEFAULT_FOLDER_LIST_SORT_KEY,
    listedNodes,
    nodeViewById,
    listRebuildKey: buildFolderListRebuildKey(props, listedNodes),
    manualChildOrder: props.sortKey === 'manual'
      ? listedNodes.map((node) => node.id)
      : resolveFolderManualChildOrder(props),
    onChangeSearchQuery: props.onChangeSearchQuery,
    onChangeSortDirection: props.onChangeSortDirection,
    onChangeSortKey: props.onChangeSortKey
  });

  return {
    nodeViewById,
    resolvedFolderTitle: resolveFolderTitle(props.folderTitle, props.folderNodeId, props.nodesById),
    state
  };
}

export function FolderListView(props: FolderListViewProps) {
  const { nodeViewById, resolvedFolderTitle, state } = useResolvedFolderListState(props);
  const deleteNodes = useWorkspaceStore((storeState) => storeState.deleteNodes);
  const setFolderManualChildOrder = useWorkspaceStore((storeState) => storeState.setFolderManualChildOrder);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const headerMode = props.showEmbeddedHeader === false ? 'hidden' : 'full';
  const canManualDrag = Boolean(props.folderNodeId && state.sortKey === 'manual' && !state.searchQuery.trim());
  const currentViewActions = buildFolderListCurrentViewActions(props, deleteNodes, state.filteredNodes);

  return (
    <div ref={scrollElementRef} className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label={props.regionLabel ?? 'Folder list view'} className="mx-auto flex w-full flex-1 flex-col">
        <FolderListViewLayout
          currentViewActions={props.currentViewActions ?? currentViewActions}
          filteredNodes={state.filteredNodes}
          folderTitle={resolvedFolderTitle}
          headerMode={headerMode}
          itemCountLabel={state.itemCountLabel}
          navigationOverlay={props.navigationOverlay ? <FolderListNavigationOverlay {...props.navigationOverlay} /> : null}
          onChangeSearchQuery={state.setSearchQuery}
          onChangeSortDirection={state.updateSortDirection}
          onChangeSortKey={state.updateSortKey}
          onRenderItem={(node) => renderFolderListItem({
            canManualDrag,
            childNodes: state.childNodes,
            draggedNodeId,
            itemLayout: props.itemLayout ?? 'default',
            node,
            nodeViewById,
            nodesById: props.nodesById,
            onSelectNode: props.onSelectNode,
            ...(props.folderNodeId ? { folderNodeId: props.folderNodeId } : {}),
            ...(props.onSelectNodePath ? { onSelectNodePath: props.onSelectNodePath } : {}),
            setDraggedNodeId,
            ...(setFolderManualChildOrder ? { setFolderManualChildOrder } : {}),
            sortKey: state.sortKey
          })}
          searchQuery={state.searchQuery}
          searchResultLabel={state.searchResultLabel}
          scrollElementRef={scrollElementRef}
          sortDirection={state.sortDirection}
          sortKey={state.sortKey}
        />
      </section>
    </div>
  );
}

function renderFolderListItem(args: RenderFolderListItemArgs) {
  const nodeViewState = args.nodeViewById[args.node.id];
  return (
    <FolderListViewItem
      draggable={args.canManualDrag}
      itemLayout={args.itemLayout}
      key={args.node.id}
      node={args.node}
      {...(nodeViewState !== undefined ? { nodeViewState } : {})}
      onSelectNode={args.onSelectNode}
      {...(args.onSelectNodePath ? { onSelectNodePath: args.onSelectNodePath } : {})}
      nodesById={args.nodesById}
      onDragEnd={() => args.setDraggedNodeId(null)}
      onDragStart={() => args.setDraggedNodeId(args.node.id)}
      onDrop={() => {
        if (!args.folderNodeId || !args.draggedNodeId) return;
        const currentOrder = args.childNodes.map((childNode) => childNode.id);
        args.setFolderManualChildOrder?.(
          args.folderNodeId,
          moveNodeIdBefore(currentOrder, args.draggedNodeId, args.node.id)
        );
        args.setDraggedNodeId(null);
      }}
      sortKey={args.sortKey}
    />
  );
}
