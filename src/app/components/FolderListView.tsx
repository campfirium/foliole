import { Search } from 'lucide-react';
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
import { AppEmptyState, AppIconButton, AppInput, ToolbarActionGroup } from '../../shared/ui';

import { FolderListSortControls } from './FolderListSortControls';
import { useFolderListViewState } from './useFolderListViewState';

interface FolderListViewProps {
  folderNodeId?: string;
  nodeOrder?: string[];
  nodes?: Node[];
  nodesById: Record<string, Node>;
  onChangeSortKey?: (sortKey: FolderListSortKey) => void;
  onSelectNode: (nodeId: string) => void;
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

function FolderListHeader({
  itemCountLabel,
  isSearchOpen,
  onChangeSearchQuery,
  onToggleSearch,
  searchQuery,
  sortKey,
  onChangeSortKey
}: {
  itemCountLabel: string;
  isSearchOpen: boolean;
  searchQuery: string;
  sortKey: FolderListSortKey;
  onChangeSearchQuery: (value: string) => void;
  onToggleSearch: () => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <ToolbarActionGroup ariaLabel="Folder list search" className="gap-2 border-0">
          <AppIconButton
            aria-pressed={isSearchOpen}
            className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground data-[active=true]:bg-foreground/[0.05] data-[active=true]:text-foreground"
            data-active={isSearchOpen}
            icon={<Search aria-hidden="true" size={15} strokeWidth={1.9} />}
            label={isSearchOpen ? 'Hide folder search' : 'Search folder contents'}
            onClick={onToggleSearch}
          />
          {isSearchOpen ? (
            <AppInput
              aria-label="Search folder contents"
              className="h-8 w-[220px] border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              onChange={(event) => onChangeSearchQuery(event.target.value)}
              placeholder="Search in this folder"
              type="search"
              value={searchQuery}
            />
          ) : null}
        </ToolbarActionGroup>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Content list</h2>
          <p className="mt-1 text-sm text-foreground/65">{itemCountLabel}</p>
        </div>
      </div>
      <div className="shrink-0">
          <FolderListSortControls onChangeSortKey={onChangeSortKey} sortKey={sortKey} />
      </div>
    </div>
  );
}

function FolderListItem(props: { node: Node; onSelectNode: (nodeId: string) => void }) {
  const author = getWorkspaceListNodeAuthor(props.node);
  const opening = getWorkspaceListNodeOpening(props.node);
  const summary = opening === WORKSPACE_LIST_OPENING_FALLBACK ? '' : opening;

  return (
    <li>
      <button
        aria-label={`Open ${props.node.title}`}
        className="flex w-full flex-col gap-3 border-b border-border/55 py-5 text-left transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none last:border-b-0"
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
  emptyState,
  folderNodeId,
  nodeOrder,
  nodes,
  nodesById,
  onChangeSortKey,
  onSelectNode,
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

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label={regionLabel ?? 'Folder list view'} className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        {showEmbeddedHeader ? (
          <FolderListHeader
            isSearchOpen={state.isSearchOpen}
            itemCountLabel={state.itemCountLabel}
            onChangeSearchQuery={state.setSearchQuery}
            onChangeSortKey={state.updateSortKey}
            onToggleSearch={state.toggleSearch}
            searchQuery={state.searchQuery}
            sortKey={state.sortKey}
          />
        ) : null}
        {state.filteredNodes.length === 0 ? (
          <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
            <AppEmptyState description={currentEmptyState.description} title={currentEmptyState.title} />
          </div>
        ) : (
          <ul aria-label="Folder contents" className="flex flex-col">
            {state.filteredNodes.map((node) => (
              <FolderListItem key={node.id} node={node} onSelectNode={onSelectNode} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
