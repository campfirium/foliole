import { useMemo, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  sortFolderListNodes,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  WORKSPACE_LIST_OPENING_FALLBACK,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeOpening
} from '../../features/nodes/model/workspaceListNode';
import { AppEmptyState } from '../../shared/ui';

import { FolderListSortControls } from './FolderListSortControls';

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

function formatItemCount(count: number) {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

const DEFAULT_EMPTY_STATE = {
  description: 'Direct children will appear here after you add notes, folders, or items to this folder.',
  title: 'This folder is empty'
} as const;

function FolderListHeader({
  itemCount,
  sortKey,
  onChangeSortKey
}: {
  itemCount: number;
  sortKey: FolderListSortKey;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">Content list</h2>
        <p className="mt-1 text-sm text-foreground/65">{formatItemCount(itemCount)}</p>
      </div>
      <FolderListSortControls onChangeSortKey={onChangeSortKey} sortKey={sortKey} />
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
        className="flex w-full flex-col gap-2 border-b border-border/45 py-4 text-left transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none last:border-b-0"
        onClick={() => props.onSelectNode(props.node.id)}
        type="button"
      >
        <div className="flex items-start justify-between gap-4">
          <span
            className="line-clamp-2 block min-w-0 flex-1 break-words text-[15px] font-semibold leading-6 text-foreground"
            data-testid={`folder-list-title-${props.node.id}`}
          >
            {props.node.title}
          </span>
          <span
            className="shrink-0 pt-0.5 text-xs leading-5 text-foreground/52"
            data-testid={`folder-list-date-${props.node.id}`}
          >
            {getWorkspaceListNodeDateLabel(props.node)}
          </span>
        </div>
        <span
          className="block min-h-12 line-clamp-2 text-sm leading-6 text-foreground/74"
          data-testid={`folder-list-excerpt-${props.node.id}`}
        >
          {summary}
        </span>
        {author ? (
          <span
            className="block min-h-5 min-w-0 truncate text-xs leading-5 text-foreground/52"
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
  const [uncontrolledSortKey, setUncontrolledSortKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);
  const sortKey = controlledSortKey ?? uncontrolledSortKey;
  const handleChangeSortKey = (nextSortKey: FolderListSortKey) => {
    if (controlledSortKey === undefined) {
      setUncontrolledSortKey(nextSortKey);
    }
    onChangeSortKey?.(nextSortKey);
  };
  const listedNodes = useMemo(
    () => resolveListedNodes({ emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel }),
    [emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel]
  );
  const childNodes = useMemo(
    () => sortFolderListNodes(listedNodes, sortKey),
    [listedNodes, sortKey]
  );
  const resolvedEmptyState = emptyState ?? DEFAULT_EMPTY_STATE;

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 max-[1080px]:px-2">
      <section aria-label={regionLabel ?? 'Folder list view'} className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        {showEmbeddedHeader ? (
          <FolderListHeader itemCount={childNodes.length} onChangeSortKey={handleChangeSortKey} sortKey={sortKey} />
        ) : null}
        {childNodes.length === 0 ? (
          <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
            <AppEmptyState description={resolvedEmptyState.description} title={resolvedEmptyState.title} />
          </div>
        ) : (
          <ul aria-label="Folder contents" className="flex flex-col">
            {childNodes.map((node) => (
              <FolderListItem key={node.id} node={node} onSelectNode={onSelectNode} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
