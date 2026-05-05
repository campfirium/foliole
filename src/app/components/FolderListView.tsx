import { useMemo, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_KEY,
  sortFolderListNodes,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import { getNodeKindLabel } from '../../features/nodes/model/nodeKindLabel';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  WORKSPACE_LIST_OPENING_FALLBACK,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeOpening
} from '../../features/nodes/model/workspaceListNode';
import { AppButton, AppListItem, AppListSectionHeader, AppListSurface, AppStatusBadge } from '../../shared/ui';

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

function getFolderListMetaLabel(node: Node, author: string | null) {
  const kindLabel = getNodeKindLabel(node.kind);
  if (!author) {
    return kindLabel;
  }
  return `${kindLabel} · ${author}`;
}

function getFolderListOpeningStatus(node: Node) {
  return getWorkspaceListNodeOpening(node) === WORKSPACE_LIST_OPENING_FALLBACK ? null : 'Has opening';
}

function getFolderListAuthorStatus(author: string | null) {
  return author ? 'Author listed' : 'No author';
}

function getFolderListAuthorTone(author: string | null) {
  return author ? ('success' as const) : ('neutral' as const);
}

function getFolderListOpeningTone(node: Node) {
  return getWorkspaceListNodeOpening(node) === WORKSPACE_LIST_OPENING_FALLBACK ? ('neutral' as const) : ('info' as const);
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
    <AppButton
      active={props.isActive}
      aria-pressed={props.isActive}
      className={[
        'rounded-full border px-3 py-1 text-xs font-medium',
        props.isActive
          ? 'border-border-strong bg-bg-elevated text-foreground'
          : 'border-border bg-transparent text-foreground/72 hover:bg-bg-elevated hover:text-foreground'
      ].join(' ')}
      onClick={props.onClick}
      variant="ghost"
    >
      {props.label}
    </AppButton>
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
    <AppListSectionHeader
      countLabel={formatItemCount(itemCount)}
      description="Browse notes in a denser work list and sort them without leaving the page."
      title="Content list"
      toolbar={
        <>
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
        </>
      }
    />
  );
}

function FolderListItem(props: { node: Node; onSelectNode: (nodeId: string) => void }) {
  const author = getWorkspaceListNodeAuthor(props.node);
  const opening = getWorkspaceListNodeOpening(props.node);
  const openingStatus = getFolderListOpeningStatus(props.node);

  return (
    <li>
      <AppListItem
        actions={
          <div className="flex items-center justify-start gap-2">
            <AppStatusBadge label={getNodeKindLabel(props.node.kind)} />
            <AppStatusBadge label={getFolderListAuthorStatus(author)} tone={getFolderListAuthorTone(author)} />
            {openingStatus ? <AppStatusBadge label={openingStatus} tone={getFolderListOpeningTone(props.node)} /> : null}
          </div>
        }
        ariaLabel={`Open ${props.node.title}`}
        meta={<span className="block min-h-4 min-w-0 truncate" data-testid={`folder-list-author-${props.node.id}`}>{getFolderListMetaLabel(props.node, author)}</span>}
        onClick={() => props.onSelectNode(props.node.id)}
        summary={
          <span className="block min-h-10 line-clamp-2" data-testid={`folder-list-excerpt-${props.node.id}`}>
            {opening === WORKSPACE_LIST_OPENING_FALLBACK ? '' : opening}
          </span>
        }
        title={
          <span className="line-clamp-2 block break-words" data-testid={`folder-list-title-${props.node.id}`}>
            {props.node.title}
          </span>
        }
        trailing={<span data-testid={`folder-list-date-${props.node.id}`}>Updated {getWorkspaceListNodeDateLabel(props.node)}</span>}
      />
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
    <div className="flex min-h-0 flex-1 px-4 pt-4 pb-4 max-[1080px]:px-2 max-[1080px]:pt-2">
      <AppListSurface
        aria-label={regionLabel ?? 'Folder list view'}
        className="mx-auto w-full max-w-[var(--document-max-width)]"
        emptyState={resolvedEmptyState}
        header={<FolderListHeader itemCount={childNodes.length} onChangeSortKey={setSortKey} sortKey={sortKey} />}
        isEmpty={childNodes.length === 0}
      >
        <ul aria-label="Folder contents" className="flex min-h-0 flex-1 flex-col">
          {childNodes.map((node) => (
            <FolderListItem key={node.id} node={node} onSelectNode={onSelectNode} />
          ))}
        </ul>
      </AppListSurface>
    </div>
  );
}
