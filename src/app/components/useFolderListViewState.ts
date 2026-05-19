import { useMemo, useRef, useState } from 'react';

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

function resolveControlledValue<T>(controlledValue: T | undefined, uncontrolledValue: T) {
  return controlledValue === undefined ? uncontrolledValue : controlledValue;
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

function isDynamicFolderListSortKey(sortKey: FolderListSortKey) {
  return sortKey === 'dateLastOpened' || sortKey === 'dateSaved';
}

function buildListMembershipKey(nodes: Node[]) {
  return nodes.map((node) => node.id).join('\u0000');
}

function resolveNodesBySnapshotOrder(nodes: Node[], orderedIds: string[]) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return orderedIds.map((nodeId) => nodesById.get(nodeId)).filter((node): node is Node => Boolean(node));
}

function useSortedFolderListNodes(
  listedNodes: Node[],
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>,
  sortKey: FolderListSortKey,
  sortDirection: FolderListSortDirection,
  listRebuildKey: string
) {
  const dynamicSortSnapshotRef = useRef<{ key: string; orderedIds: string[] } | null>(null);
  const previousSortControlKeyRef = useRef<string | null>(null);
  const listMembershipKey = useMemo(() => buildListMembershipKey(listedNodes), [listedNodes]);
  const sortControlKey = `${sortKey}\u0000${sortDirection}`;
  const dynamicSortSnapshotKey = `${listRebuildKey}\u0000${listMembershipKey}\u0000${sortKey}\u0000${sortDirection}`;

  return useMemo(() => {
    if (!isDynamicFolderListSortKey(sortKey)) {
      previousSortControlKeyRef.current = sortControlKey;
      return sortFolderListNodes(listedNodes, sortKey, sortDirection, nodeViewById);
    }
    const snapshot = dynamicSortSnapshotRef.current;
    if (!snapshot || snapshot.key !== dynamicSortSnapshotKey || previousSortControlKeyRef.current !== sortControlKey) {
      const sortedNodes = sortFolderListNodes(listedNodes, sortKey, sortDirection, nodeViewById);
      dynamicSortSnapshotRef.current = {
        key: dynamicSortSnapshotKey,
        orderedIds: sortedNodes.map((node) => node.id)
      };
      previousSortControlKeyRef.current = sortControlKey;
      return sortedNodes;
    }
    return resolveNodesBySnapshotOrder(listedNodes, snapshot.orderedIds);
  }, [dynamicSortSnapshotKey, listedNodes, nodeViewById, sortControlKey, sortDirection, sortKey]);
}

export function useFolderListViewState(
  listedNodes: Node[],
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>,
  controlledSearchQuery: string | undefined,
  controlledSortKey: FolderListSortKey | undefined,
  controlledSortDirection: FolderListSortDirection | undefined,
  onChangeSearchQuery: ((searchQuery: string) => void) | undefined,
  onChangeSortKey: ((sortKey: FolderListSortKey) => void) | undefined,
  onChangeSortDirection: ((sortDirection: FolderListSortDirection) => void) | undefined,
  defaultSortKey: FolderListSortKey,
  listRebuildKey: string
) {
  const [sortRefreshVersion, setSortRefreshVersion] = useState(0);
  const [uncontrolledSortKey, setUncontrolledSortKey] = useState<FolderListSortKey>(defaultSortKey);
  const [uncontrolledSortDirection, setUncontrolledSortDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );
  const [uncontrolledSearchQuery, setUncontrolledSearchQuery] = useState('');
  const searchQuery = resolveControlledValue(controlledSearchQuery, uncontrolledSearchQuery);
  const sortKey = resolveControlledValue(controlledSortKey, uncontrolledSortKey);
  const sortDirection = resolveControlledValue(controlledSortDirection, uncontrolledSortDirection);
  const childNodes = useSortedFolderListNodes(listedNodes, nodeViewById, sortKey, sortDirection, `${listRebuildKey}\u0000${sortRefreshVersion}`);
  const filteredNodes = useMemo(() => filterFolderListNodes(childNodes, searchQuery), [childNodes, searchQuery]);
  const itemCount = childNodes.length;
  const itemCountLabel = formatItemCount(itemCount);
  const searchResultLabel = searchQuery.trim() ? `${filteredNodes.length} / ${itemCount}` : null;

  return {
    filteredNodes,
    itemCountLabel,
    searchQuery,
    searchResultLabel,
    sortDirection,
    sortKey,
    setSearchQuery: (nextSearchQuery: string) => {
      if (controlledSearchQuery === undefined) {
        setUncontrolledSearchQuery(nextSearchQuery);
      }
      onChangeSearchQuery?.(nextSearchQuery);
    },
    updateSortKey: (nextSortKey: FolderListSortKey) => {
      const nextSortDirection = resolveDefaultFolderListSortDirection();
      setSortRefreshVersion((current) => current + 1);
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
