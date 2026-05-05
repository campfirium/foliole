import { useMemo, useState } from 'react';

import {
  sortFolderListNodes,
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
  controlledSortKey: FolderListSortKey | undefined,
  onChangeSortKey: ((sortKey: FolderListSortKey) => void) | undefined,
  defaultSortKey: FolderListSortKey
) {
  const [uncontrolledSortKey, setUncontrolledSortKey] = useState<FolderListSortKey>(defaultSortKey);
  const [searchQuery, setSearchQuery] = useState('');
  const sortKey = controlledSortKey ?? uncontrolledSortKey;
  const childNodes = useMemo(() => sortFolderListNodes(listedNodes, sortKey), [listedNodes, sortKey]);
  const filteredNodes = useMemo(() => filterFolderListNodes(childNodes, searchQuery), [childNodes, searchQuery]);
  const itemCount = childNodes.length;
  const itemCountLabel = searchQuery.trim() ? `${filteredNodes.length} / ${itemCount}` : formatItemCount(itemCount);

  return {
    filteredNodes,
    itemCountLabel,
    searchQuery,
    sortKey,
    setSearchQuery,
    updateSortKey: (nextSortKey: FolderListSortKey) => {
      if (controlledSortKey === undefined) {
        setUncontrolledSortKey(nextSortKey);
      }
      onChangeSortKey?.(nextSortKey);
    }
  };
}
