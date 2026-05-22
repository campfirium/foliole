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

type UseFolderListViewStateArgs = {
  controlledSearchQuery: string | undefined;
  controlledSortDirection: FolderListSortDirection | undefined;
  controlledSortKey: FolderListSortKey | undefined;
  defaultSortKey: FolderListSortKey;
  listedNodes: Node[];
  listRebuildKey: string;
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>;
  onChangeSearchQuery: ((searchQuery: string) => void) | undefined;
  onChangeSortDirection: ((sortDirection: FolderListSortDirection) => void) | undefined;
  onChangeSortKey: ((sortKey: FolderListSortKey) => void) | undefined;
};

function formatItemCount(count: number) {
  return String(count);
}

function resolveControlledValue<T>(controlledValue: T | undefined, uncontrolledValue: T) {
  return controlledValue === undefined ? uncontrolledValue : controlledValue;
}

function resolveEffectiveSortDirection(
  sortKey: FolderListSortKey,
  controlledSortDirection: FolderListSortDirection | undefined,
  uncontrolledSortDirection: FolderListSortDirection
) {
  return sortKey === 'dateLastOpened'
    ? 'desc'
    : resolveControlledValue(controlledSortDirection, uncontrolledSortDirection);
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
  return sortKey === 'dateSaved';
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

function applyFolderSortDirection(args: {
  controlledSortDirection: FolderListSortDirection | undefined;
  nextSortDirection: FolderListSortDirection;
  onChangeSortDirection: ((sortDirection: FolderListSortDirection) => void) | undefined;
  setUncontrolledSortDirection: (value: FolderListSortDirection) => void;
  sortKey: FolderListSortKey;
}) {
  const nextDirection = args.sortKey === 'dateLastOpened' ? 'desc' : args.nextSortDirection;
  if (args.controlledSortDirection === undefined) {
    args.setUncontrolledSortDirection(nextDirection);
  }
  args.onChangeSortDirection?.(nextDirection);
}

function applyFolderSearchQuery(args: {
  controlledSearchQuery: string | undefined;
  nextSearchQuery: string;
  onChangeSearchQuery: ((searchQuery: string) => void) | undefined;
  setUncontrolledSearchQuery: (value: string) => void;
}) {
  if (args.controlledSearchQuery === undefined) {
    args.setUncontrolledSearchQuery(args.nextSearchQuery);
  }
  args.onChangeSearchQuery?.(args.nextSearchQuery);
}

function applyFolderSortKey(args: {
  controlledSortDirection: FolderListSortDirection | undefined;
  controlledSortKey: FolderListSortKey | undefined;
  nextSortKey: FolderListSortKey;
  onChangeSortDirection: ((sortDirection: FolderListSortDirection) => void) | undefined;
  onChangeSortKey: ((sortKey: FolderListSortKey) => void) | undefined;
  setSortRefreshVersion: (updater: (current: number) => number) => void;
  setUncontrolledSortDirection: (value: FolderListSortDirection) => void;
  setUncontrolledSortKey: (value: FolderListSortKey) => void;
}) {
  const nextSortDirection = resolveDefaultFolderListSortDirection();
  args.setSortRefreshVersion((current) => current + 1);
  if (args.controlledSortKey === undefined) {
    args.setUncontrolledSortKey(args.nextSortKey);
  }
  if (args.controlledSortDirection === undefined) {
    args.setUncontrolledSortDirection(nextSortDirection);
  }
  args.onChangeSortKey?.(args.nextSortKey);
  args.onChangeSortDirection?.(nextSortDirection);
}

export function useFolderListViewState(args: UseFolderListViewStateArgs) {
  const [sortRefreshVersion, setSortRefreshVersion] = useState(0);
  const [uncontrolledSortKey, setUncontrolledSortKey] = useState<FolderListSortKey>(args.defaultSortKey);
  const [uncontrolledSortDirection, setUncontrolledSortDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );
  const [uncontrolledSearchQuery, setUncontrolledSearchQuery] = useState('');
  const searchQuery = resolveControlledValue(args.controlledSearchQuery, uncontrolledSearchQuery);
  const sortKey = resolveControlledValue(args.controlledSortKey, uncontrolledSortKey);
  const sortDirection = resolveEffectiveSortDirection(sortKey, args.controlledSortDirection, uncontrolledSortDirection);
  const childNodes = useSortedFolderListNodes(args.listedNodes, args.nodeViewById, sortKey, sortDirection, `${args.listRebuildKey}\u0000${sortRefreshVersion}`);
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
      applyFolderSearchQuery({
        controlledSearchQuery: args.controlledSearchQuery,
        nextSearchQuery,
        onChangeSearchQuery: args.onChangeSearchQuery,
        setUncontrolledSearchQuery
      });
    },
    updateSortKey: (nextSortKey: FolderListSortKey) => {
      applyFolderSortKey({
        controlledSortDirection: args.controlledSortDirection,
        controlledSortKey: args.controlledSortKey,
        nextSortKey,
        onChangeSortDirection: args.onChangeSortDirection,
        onChangeSortKey: args.onChangeSortKey,
        setSortRefreshVersion,
        setUncontrolledSortDirection,
        setUncontrolledSortKey
      });
    },
    updateSortDirection: (nextSortDirection: FolderListSortDirection) => {
      applyFolderSortDirection({
        controlledSortDirection: args.controlledSortDirection,
        nextSortDirection,
        onChangeSortDirection: args.onChangeSortDirection,
        setUncontrolledSortDirection,
        sortKey
      });
    }
  };
}
