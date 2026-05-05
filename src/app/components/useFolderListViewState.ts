import { useMemo, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  resolveDefaultFolderListSortDirection,
  sortFolderListNodes,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  WORKSPACE_LIST_OPENING_FALLBACK,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeOpening
} from '../../features/nodes/model/workspaceListNode';

function formatItemCount(count: number) {
  return String(count);
}

function filterFolderListNodes(nodes: Node[], searchQuery: string) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return nodes;
  }

  return nodes.filter((node) => {
    const author = getWorkspaceListNodeAuthor(node)?.toLocaleLowerCase() ?? '';
    const opening = getWorkspaceListNodeOpening(node);
    const summary = opening === WORKSPACE_LIST_OPENING_FALLBACK ? '' : opening;
    return (
      node.title.toLocaleLowerCase().includes(normalizedQuery) ||
      author.includes(normalizedQuery) ||
      summary.toLocaleLowerCase().includes(normalizedQuery)
    );
  });
}

export function useFolderListViewState(
  listedNodes: Node[],
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>,
  controlledSortKey: FolderListSortKey | undefined,
  controlledSortDirection: FolderListSortDirection | undefined,
  onChangeSortKey: ((sortKey: FolderListSortKey) => void) | undefined,
  onChangeSortDirection: ((sortDirection: FolderListSortDirection) => void) | undefined,
  defaultSortKey: FolderListSortKey
) {
  const [uncontrolledSortKey, setUncontrolledSortKey] = useState<FolderListSortKey>(defaultSortKey);
  const [uncontrolledSortDirection, setUncontrolledSortDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );
  const [searchQuery, setSearchQuery] = useState('');
  const sortKey = controlledSortKey ?? uncontrolledSortKey;
  const sortDirection = controlledSortDirection ?? uncontrolledSortDirection;
  const childNodes = useMemo(
    () => sortFolderListNodes(listedNodes, sortKey, sortDirection, nodeViewById),
    [listedNodes, nodeViewById, sortDirection, sortKey]
  );
  const filteredNodes = useMemo(() => filterFolderListNodes(childNodes, searchQuery), [childNodes, searchQuery]);
  const itemCount = childNodes.length;
  const itemCountLabel = searchQuery.trim() ? `${filteredNodes.length} / ${itemCount}` : formatItemCount(itemCount);

  return {
    filteredNodes,
    itemCountLabel,
    searchQuery,
    sortDirection,
    sortKey,
    setSearchQuery,
    updateSortKey: (nextSortKey: FolderListSortKey) => {
      const nextSortDirection = resolveDefaultFolderListSortDirection(nextSortKey);
      if (controlledSortKey === undefined) {
        setUncontrolledSortKey(nextSortKey);
      }
      if (controlledSortDirection === undefined) {
        setUncontrolledSortDirection(nextSortDirection);
      }
      onChangeSortKey?.(nextSortKey);
      onChangeSortDirection?.(nextSortDirection);
    },
    updateSortDirection: (nextSortDirection: FolderListSortDirection) => {
      if (controlledSortDirection === undefined) {
        setUncontrolledSortDirection(nextSortDirection);
      }
      onChangeSortDirection?.(nextSortDirection);
    }
  };
}
