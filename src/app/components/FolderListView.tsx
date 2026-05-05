import { useMemo, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  sortFolderListNodes,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeSummary
} from '../../features/nodes/model/workspaceListNode';

interface FolderListViewProps {
  folderNodeId?: string;
  nodeOrder?: string[];
  nodes?: Node[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  emptyState?: {
    description: string;
    title: string;
  };
  regionLabel?: string;
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

function renderAuthorSlot(nodeId: string) {
  return (
    <span
      aria-label="Author unavailable"
      className="block min-h-4 min-w-0 truncate text-xs text-foreground/52"
      data-testid={`folder-list-author-${nodeId}`}
    />
  );
}

const FOLDER_LIST_SORT_OPTIONS: { key: FolderListSortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' }
];

function FolderListSortButton(props: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={props.isActive}
      className={[
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        props.isActive
          ? 'border-border-strong bg-bg-elevated text-foreground'
          : 'border-border bg-transparent text-foreground/72 hover:bg-bg-elevated hover:text-foreground'
      ].join(' ')}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div aria-label="Folder list sorting" className="flex flex-wrap items-center gap-2 text-sm text-foreground/72">
        <span className="font-medium text-foreground">Sort</span>
        {FOLDER_LIST_SORT_OPTIONS.map((option) => (
          <FolderListSortButton
            isActive={sortKey === option.key}
            key={option.key}
            label={option.label}
            onClick={() => onChangeSortKey(option.key)}
          />
        ))}
        <span className="text-xs text-foreground/56">Default: latest updated first</span>
      </div>
      <p className="text-sm text-foreground/65">{formatItemCount(itemCount)}</p>
    </div>
  );
}

function FolderListEmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="max-w-md text-center">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-foreground/68">{description}</p>
      </div>
    </div>
  );
}

function FolderListItem(props: { node: Node; onSelectNode: (nodeId: string) => void }) {
  const author = getWorkspaceListNodeAuthor(props.node);

  return (
    <li>
      <button
        aria-label={`Open ${props.node.title}`}
        className="flex w-full flex-col gap-3 rounded-[var(--radius-2)] border border-transparent px-4 py-3 text-left transition-colors hover:bg-bg-elevated focus-visible:border-border focus-visible:bg-bg-elevated focus-visible:outline-none"
        onClick={() => props.onSelectNode(props.node.id)}
        type="button"
      >
        <span className="block min-w-0">
          <span
            className="line-clamp-2 block break-words text-sm font-semibold leading-5 text-foreground"
            data-testid={`folder-list-title-${props.node.id}`}
          >
            {props.node.title}
          </span>
          <span
            className="mt-1 block min-h-10 line-clamp-2 text-xs leading-5 text-foreground/62"
            data-testid={`folder-list-excerpt-${props.node.id}`}
          >
            {getWorkspaceListNodeSummary(props.node)}
          </span>
        </span>
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          {author ? (
            <span
              className="block min-h-4 min-w-0 truncate text-xs text-foreground/52"
              data-testid={`folder-list-author-${props.node.id}`}
            >
              {author}
            </span>
          ) : (
            renderAuthorSlot(props.node.id)
          )}
          <span className="shrink-0 text-xs text-foreground/56" data-testid={`folder-list-date-${props.node.id}`}>
            {getWorkspaceListNodeDateLabel(props.node)}
          </span>
        </span>
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

export function FolderListView({ emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel }: FolderListViewProps) {
  const [sortKey, setSortKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);
  const childNodes = useMemo(
    () => sortFolderListNodes(resolveListedNodes({ emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel }), sortKey),
    [emptyState, folderNodeId, nodeOrder, nodes, nodesById, onSelectNode, regionLabel, sortKey]
  );
  const resolvedEmptyState = emptyState ?? DEFAULT_EMPTY_STATE;

  return (
    <div className="flex min-h-0 flex-1 px-4 pt-4 pb-4 max-[1080px]:px-2 max-[1080px]:pt-2">
      <section
        aria-label={regionLabel ?? 'Folder list view'}
        className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col overflow-hidden rounded-[var(--radius-3)] border border-border bg-bg-panel"
      >
        <FolderListHeader itemCount={childNodes.length} onChangeSortKey={setSortKey} sortKey={sortKey} />

        {childNodes.length === 0 ? (
          <FolderListEmptyState description={resolvedEmptyState.description} title={resolvedEmptyState.title} />
        ) : (
          <ul aria-label="Folder contents" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
            {childNodes.map((node) => (
              <FolderListItem key={node.id} node={node} onSelectNode={onSelectNode} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
