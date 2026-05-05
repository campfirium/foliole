import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  WORKSPACE_LIST_OPENING_FALLBACK,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeLastOpenedLabel,
  getWorkspaceListNodeOpening
} from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { FolderListTextItem } from './FolderListItemRow';
import { resolveFolderListLocationPath } from './folderListLocationPath';
import { FolderListViewLayout } from './FolderListViewLayout';
import { useFolderListViewState } from './useFolderListViewState';

interface FolderListViewProps {
  documentMaxWidth?: number;
  folderNodeId?: string;
  folderTitle?: string;
  nodeOrder?: string[];
  nodes?: Node[];
  nodeViewById?: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, Node>;
  onChangeSearchQuery?: (searchQuery: string) => void;
  onChangeSortDirection?: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey?: (sortKey: FolderListSortKey) => void;
  onResetLayout?: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  onStartDocumentResize?: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  searchQuery?: string;
  emptyState?: {
    description: string;
    title: string;
  };
  regionLabel?: string;
  showEmbeddedHeader?: boolean;
  itemLayout?: 'default' | 'virtual-result';
  sortDirection?: FolderListSortDirection;
  sortKey?: FolderListSortKey;
}

function getDirectChildNodes(folderNodeId: string, nodeOrder: string[], nodesById: Record<string, Node>) {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === folderNodeId));
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

type FolderListItemProps = {
  itemLayout: NonNullable<FolderListViewProps['itemLayout']>;
  node: Node;
  nodeViewState?: NodeViewState;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  nodesById: Record<string, Node>;
  sortKey: FolderListSortKey;
};

function renderVirtualResultItem(props: FolderListItemProps & { dateLabel: string; locationPath: string }) {
  return (
    <li>
      <div className="flex flex-col gap-2 py-5">
        <div className="flex items-start justify-between gap-4">
          <button
            aria-label={`Open ${props.node.title}`}
            className="min-w-0 flex-1 text-left text-[17px] font-normal leading-7 text-foreground transition-colors hover:text-accent-strong focus-visible:outline-none"
            onClick={() => props.onSelectNode(props.node.id)}
            type="button"
          >
            <span className="line-clamp-2 block break-words" data-testid={`folder-list-title-${props.node.id}`}>
              {props.node.title}
            </span>
          </button>
          <span
            className="shrink-0 pt-1 text-[13px] leading-5 text-foreground/56"
            data-testid={`folder-list-date-${props.node.id}`}
          >
            {props.dateLabel}
          </span>
        </div>
        <button
          aria-label={`Open real location for ${props.node.title}`}
          className="w-fit max-w-full truncate text-left text-[13px] leading-5 text-foreground/56 underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none"
          onClick={() => (props.onSelectNodePath ?? props.onSelectNode)(props.node.id)}
          type="button"
        >
          {props.locationPath}
        </button>
      </div>
    </li>
  );
}

function FolderListItem(props: FolderListItemProps) {
  const author = getWorkspaceListNodeAuthor(props.node);
  const opening = getWorkspaceListNodeOpening(props.node);
  const summary = opening === WORKSPACE_LIST_OPENING_FALLBACK ? '' : opening;
  const dateLabel =
    props.sortKey === 'dateLastOpened'
      ? getWorkspaceListNodeLastOpenedLabel(props.nodeViewState)
      : getWorkspaceListNodeDateLabel(props.node);
  const locationPath = resolveFolderListLocationPath(props.node, props.nodesById);

  if (props.itemLayout === 'virtual-result') {
    return renderVirtualResultItem({ ...props, dateLabel, locationPath });
  }

  return (
    <FolderListTextItem
      ariaLabel={`Open ${props.node.title}`}
      author={author}
      dateLabel={dateLabel}
      nodeId={props.node.id}
      onClick={() => props.onSelectNode(props.node.id)}
      summary={summary}
      title={props.node.title}
    />
  );
}

function resolveListedNodes(props: FolderListViewProps) {
  if (props.nodes) {
    return props.nodes;
  }
  if (!props.folderNodeId || !props.nodeOrder) {
    return [];
  }
  return getDirectChildNodes(props.folderNodeId, props.nodeOrder, props.nodesById);
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

function useResolvedFolderListState(props: FolderListViewProps) {
  const storeNodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const nodeViewById = props.nodeViewById ?? storeNodeViewById;
  const listedNodes = useMemo(
    () => resolveListedNodes(props),
    [props.emptyState, props.folderNodeId, props.nodeOrder, props.nodes, props.nodesById, props.onSelectNode, props.regionLabel]
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
    DEFAULT_FOLDER_LIST_SORT_KEY
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
  const headerMode = props.showEmbeddedHeader === false ? 'hidden' : 'full';

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label={props.regionLabel ?? 'Folder list view'} className="mx-auto flex w-full flex-1 flex-col">
        <FolderListViewLayout
          currentEmptyState={resolvedEmptyState}
          documentMaxWidth={props.documentMaxWidth}
          filteredNodes={state.filteredNodes}
          folderTitle={resolvedFolderTitle}
          headerMode={headerMode}
          itemCountLabel={state.itemCountLabel}
          onChangeSearchQuery={state.setSearchQuery}
          onChangeSortDirection={state.updateSortDirection}
          onChangeSortKey={state.updateSortKey}
          onRenderItem={(node) => (
            <FolderListItem
              itemLayout={props.itemLayout ?? 'default'}
              key={node.id}
              node={node}
              nodeViewState={nodeViewById[node.id]}
              onSelectNode={props.onSelectNode}
              onSelectNodePath={props.onSelectNodePath}
              nodesById={props.nodesById}
              sortKey={state.sortKey}
            />
          )}
          onResetLayout={props.onResetLayout}
          onStartDocumentResize={props.onStartDocumentResize}
          searchQuery={state.searchQuery}
          sortDirection={state.sortDirection}
          sortKey={state.sortKey}
        />
      </section>
    </div>
  );
}
