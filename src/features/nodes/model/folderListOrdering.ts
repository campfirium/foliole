import type { Node } from './nodeTypes';
import { compareWorkspaceListNodeDateDesc } from './workspaceListNode';
import { compareWorkspaceListNodeAuthor } from './workspaceListNodeMetadata';

export type FolderListSortKey = 'dateImported' | 'dateLastOpened' | 'dateSaved' | 'title';
export type FolderListSortDirection = 'desc' | 'asc';

export const DEFAULT_FOLDER_LIST_SORT_KEY: FolderListSortKey = 'dateImported';
export const DEFAULT_FOLDER_LIST_SORT_DIRECTION: FolderListSortDirection = 'desc';

export function resolveDefaultFolderListSortDirection(sortKey: FolderListSortKey): FolderListSortDirection {
  return sortKey === 'title' ? 'asc' : 'desc';
}

function normalizeSortText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function resolveNodeLastOpenedTimestamp(nodeId: string, nodeViewById: Record<string, { updatedAt?: string | null } | undefined>) {
  const updatedAt = nodeViewById[nodeId]?.updatedAt?.trim();
  if (updatedAt && !Number.isNaN(new Date(updatedAt).getTime())) {
    return updatedAt;
  }
  return null;
}

function compareLastOpenedDesc(
  leftNodeId: string,
  rightNodeId: string,
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>
) {
  const leftTimestamp = resolveNodeLastOpenedTimestamp(leftNodeId, nodeViewById);
  const rightTimestamp = resolveNodeLastOpenedTimestamp(rightNodeId, nodeViewById);
  if (!leftTimestamp && !rightTimestamp) {
    return 0;
  }
  if (!leftTimestamp) {
    return 1;
  }
  if (!rightTimestamp) {
    return -1;
  }
  return rightTimestamp.localeCompare(leftTimestamp);
}

function compareTitle(
  left: { node: Node; title: string },
  right: { node: Node; title: string },
  sortDirection: FolderListSortDirection
) {
  const titleResult = compareText(left.title, right.title) * (sortDirection === 'asc' ? 1 : -1);
  if (titleResult !== 0) {
    return titleResult;
  }
  return compareWorkspaceListNodeDateDesc(left.node, right.node);
}

function compareImportedDate(
  left: { node: Node; title: string },
  right: { node: Node; title: string },
  directionMultiplier: number
) {
  const dateResult = compareWorkspaceListNodeDateDesc(left.node, right.node) * directionMultiplier;
  if (dateResult !== 0) {
    return dateResult;
  }
  return compareText(left.title, right.title);
}

function compareLastOpened(
  left: { node: Node; title: string },
  right: { node: Node; title: string },
  directionMultiplier: number,
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>
) {
  const dateResult = compareLastOpenedDesc(left.node.id, right.node.id, nodeViewById) * directionMultiplier;
  if (dateResult !== 0) {
    return dateResult;
  }
  const titleResult = compareText(left.title, right.title);
  if (titleResult !== 0) {
    return titleResult;
  }
  const importedDateResult = compareWorkspaceListNodeDateDesc(left.node, right.node);
  if (importedDateResult !== 0) {
    return importedDateResult;
  }
  return compareWorkspaceListNodeAuthor(left.node, right.node);
}

export function sortFolderListNodes(
  nodes: Node[],
  sortKey: FolderListSortKey,
  sortDirection: FolderListSortDirection,
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined>
) {
  const directionMultiplier = sortDirection === 'asc' ? -1 : 1;

  return nodes
    .map((node, index) => ({
      index,
      node,
      title: normalizeSortText(node.title)
    }))
    .sort((left, right) => {
      if (sortKey === 'title') {
        const titleResult = compareTitle(left, right, sortDirection);
        if (titleResult !== 0) {
          return titleResult;
        }
      }

      if (sortKey === 'dateImported' || sortKey === 'dateSaved') {
        const dateResult = compareImportedDate(left, right, directionMultiplier);
        if (dateResult !== 0) {
          return dateResult;
        }
      }

      if (sortKey === 'dateLastOpened') {
        const dateResult = compareLastOpened(left, right, directionMultiplier, nodeViewById);
        if (dateResult !== 0) {
          return dateResult;
        }
      }

      const dateResult = compareWorkspaceListNodeDateDesc(left.node, right.node);
      if (dateResult !== 0) {
        return dateResult;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.node);
}
