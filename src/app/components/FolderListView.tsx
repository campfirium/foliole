import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  WORKSPACE_LIST_OPENING_FALLBACK,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeOpening
} from '../../features/nodes/model/workspaceListNode';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { FolderListViewLayout } from './FolderListViewLayout';
import { useFolderListViewState } from './useFolderListViewState';

interface FolderListViewProps {
  documentMaxWidth?: number;
  folderNodeId?: string;
  folderTitle?: string;
  nodeOrder?: string[];
  nodes?: Node[];
  nodesById: Record<string, Node>;
  onChangeSortKey?: (sortKey: FolderListSortKey) => void;
  onResetLayout?: () => void;
  onSelectNode: (nodeId: string) => void;
  onStartDocumentResize?: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  emptyState?: {
    description: string;
    title: string;
  };
  regionLabel?: string;
  showEmbeddedHeader?: boolean;
  sortKey?: FolderListSortKey;
}

function getDirectChildNodes(folderNodeId: string, nodeOrder: string[], nodesById: Record<string, Node>) {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === folderNodeId));
}

const DEFAULT_EMPTY_STATE = {
  description: 'Direct children will appear here after you add notes, folders, or items to this folder.',
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

function FolderListItem(props: { node: Node; onSelectNode: (nodeId: string) => void }) {
  const author = getWorkspaceListNodeAuthor(props.node);
  const opening = getWorkspaceListNodeOpening(props.node);
  const summary = opening === WORKSPACE_LIST_OPENING_FALLBACK ? '' : opening;

  return (
    <li>
      <button
        aria-label={`Open ${props.node.title}`}
        className="flex w-full flex-col gap-3 py-5 text-left transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none"
        onClick={() => props.onSelectNode(props.node.id)}
        type="button"
      >
        <div className="flex items-start justify-between gap-4">
          <span
            className="line-clamp-2 block min-w-0 flex-1 break-words text-[17px] font-semibold leading-7 text-foreground"
            data-testid={`folder-list-title-${props.node.id}`}
          >
            {props.node.title}
          </span>
          <span
            className="shrink-0 pt-1 text-[13px] leading-5 text-foreground/56"
            data-testid={`folder-list-date-${props.node.id}`}
          >
            {getWorkspaceListNodeDateLabel(props.node)}
          </span>
        </div>
        <span
          className="block min-h-14 line-clamp-2 text-[15px] leading-7 text-foreground/74"
          data-testid={`folder-list-excerpt-${props.node.id}`}
        >
          {summary}
        </span>
        {author ? (
          <span
            className="block min-h-5 min-w-0 truncate text-[13px] leading-5 text-foreground/56"
            data-testid={`folder-list-meta-${props.node.id}`}
          >
            {author}
          </span>
        ) : null}
      </button>
    </li>
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

export function FolderListView({
  documentMaxWidth,
  emptyState,
  folderNodeId,
  folderTitle,
  nodeOrder,
  nodes,
  nodesById,
  onChangeSortKey,
  onResetLayout,
  onSelectNode,
  onStartDocumentResize,
  regionLabel,
  showEmbeddedHeader = true,
  sortKey: controlledSortKey
}: FolderListViewProps) {
  const listedNodes = useMemo(
    () => resolveListedNodes({ emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel }),
    [emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel]
  );
  const state = useFolderListViewState(
    listedNodes,
    controlledSortKey,
    onChangeSortKey,
    DEFAULT_FOLDER_LIST_SORT_KEY
  );
  const resolvedEmptyState = emptyState ?? DEFAULT_EMPTY_STATE;
  const currentEmptyState = buildFolderListEmptyState(resolvedEmptyState, state.searchQuery);
  const resolvedFolderTitle = resolveFolderTitle(folderTitle, folderNodeId, nodesById);

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label={regionLabel ?? 'Folder list view'} className="mx-auto flex w-full flex-1 flex-col">
        <FolderListViewLayout
          currentEmptyState={currentEmptyState}
          documentMaxWidth={documentMaxWidth}
          filteredNodes={state.filteredNodes}
          folderTitle={resolvedFolderTitle}
          itemCountLabel={state.itemCountLabel}
          onChangeSearchQuery={state.setSearchQuery}
          onChangeSortKey={state.updateSortKey}
          onRenderItem={(node) => <FolderListItem key={node.id} node={node} onSelectNode={onSelectNode} />}
          onResetLayout={onResetLayout}
          onStartDocumentResize={onStartDocumentResize}
          searchQuery={state.searchQuery}
          showEmbeddedHeader={showEmbeddedHeader}
          sortKey={state.sortKey}
        />
      </section>
    </div>
  );
}
