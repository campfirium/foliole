import type { Node } from './nodeTypes';
import { compareWorkspaceListNodeDateDesc } from './workspaceListNode';

export type FolderListSortKey = 'dateDeleted' | 'dateImported' | 'dateLastOpened' | 'dateSaved' | 'manual' | 'name';
export type FolderListSortDirection = 'desc' | 'asc';

export const DEFAULT_FOLDER_LIST_SORT_KEY: FolderListSortKey = 'dateSaved';
export const DEFAULT_FOLDER_LIST_SORT_DIRECTION: FolderListSortDirection = 'desc';

export function resolveDefaultFolderListSortDirection(sortKey?: FolderListSortKey): FolderListSortDirection {
  return sortKey === 'manual' || sortKey === 'name' ? 'asc' : 'desc';
}

function normalizeSortText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareName(left: { node: Node; title: string }, right: { node: Node; title: string }, directionMultiplier: number) {
  const titleResult = compareText(left.title, right.title) * directionMultiplier;
  if (titleResult !== 0) {
    return titleResult;
  }
  return left.node.id.localeCompare(right.node.id);
}

function resolveNodeLastOpenedTimestamp(
  nodeId: string,
  nodeOpenStateById: Record<string, { lastOpenedAt?: string | null } | undefined>
) {
  const lastOpenedAt = nodeOpenStateById[nodeId]?.lastOpenedAt?.trim();
  if (lastOpenedAt && !Number.isNaN(new Date(lastOpenedAt).getTime())) {
    return lastOpenedAt;
  }
  return null;
}

function compareLastOpenedDesc(
  leftNodeId: string,
  rightNodeId: string,
  nodeOpenStateById: Record<string, { lastOpenedAt?: string | null } | undefined>
) {
  const leftTimestamp = resolveNodeLastOpenedTimestamp(leftNodeId, nodeOpenStateById);
  const rightTimestamp = resolveNodeLastOpenedTimestamp(rightNodeId, nodeOpenStateById);
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

function resolveTimestamp(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && !Number.isNaN(new Date(trimmed).getTime()) ? trimmed : null;
}

function compareTimestampDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftTimestamp = resolveTimestamp(left);
  const rightTimestamp = resolveTimestamp(right);
  if (!leftTimestamp && !rightTimestamp) return 0;
  if (!leftTimestamp) return 1;
  if (!rightTimestamp) return -1;
  return rightTimestamp.localeCompare(leftTimestamp);
}

function compareSavedDate(
  left: { node: Node; title: string },
  right: { node: Node; title: string },
  directionMultiplier: number
) {
  const dateResult = compareTimestampDesc(left.node.updatedAt, right.node.updatedAt) * directionMultiplier;
  if (dateResult !== 0) {
    return dateResult;
  }
  return compareText(left.title, right.title);
}

function compareDeletedDate(
  left: { node: Node; title: string },
  right: { node: Node; title: string },
  directionMultiplier: number
) {
  const dateResult = compareTimestampDesc(left.node.deletedAt, right.node.deletedAt) * directionMultiplier;
  if (dateResult !== 0) {
    return dateResult;
  }
  return compareText(left.title, right.title);
}

function compareLastOpened(
  left: { node: Node; title: string },
  right: { node: Node; title: string },
  directionMultiplier: number,
  nodeOpenStateById: Record<string, { lastOpenedAt?: string | null } | undefined>
) {
  const dateResult = compareLastOpenedDesc(left.node.id, right.node.id, nodeOpenStateById) * directionMultiplier;
  if (dateResult !== 0) {
    return dateResult;
  }
  const titleResult = compareText(left.title, right.title);
  if (titleResult !== 0) {
    return titleResult;
  }
  return left.node.id.localeCompare(right.node.id);
}

export function sortFolderListNodes(
  nodes: Node[],
  sortKey: FolderListSortKey,
  sortDirection: FolderListSortDirection,
  nodeOpenStateById: Record<string, { lastOpenedAt?: string | null } | undefined>,
  manualChildOrder?: readonly string[] | null
) {
  const dateDirectionMultiplier = sortDirection === 'asc' ? -1 : 1;
  const nameDirectionMultiplier = sortDirection === 'asc' ? 1 : -1;
  const baseEntries = nodes.map((node, index) => ({
    index,
    node,
    title: normalizeSortText(node.title)
  }));

  if (sortKey === 'manual') {
    return sortManualFolderListNodes(baseEntries, manualChildOrder);
  }

  return baseEntries
    .sort((left, right) => {
      if (sortKey === 'name') {
        return compareName(left, right, nameDirectionMultiplier);
      }

      if (sortKey === 'dateImported') {
        const dateResult = compareImportedDate(left, right, dateDirectionMultiplier);
        if (dateResult !== 0) {
          return dateResult;
        }
      }

      if (sortKey === 'dateSaved') {
        const dateResult = compareSavedDate(left, right, dateDirectionMultiplier);
        if (dateResult !== 0) {
          return dateResult;
        }
      }

      if (sortKey === 'dateDeleted') {
        const dateResult = compareDeletedDate(left, right, dateDirectionMultiplier);
        if (dateResult !== 0) {
          return dateResult;
        }
      }

      if (sortKey === 'dateLastOpened') {
        return compareLastOpened(left, right, dateDirectionMultiplier, nodeOpenStateById);
      }

      const dateResult = compareWorkspaceListNodeDateDesc(left.node, right.node);
      if (dateResult !== 0) {
        return dateResult;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.node);
}

function sortManualFolderListNodes(
  entries: Array<{ index: number; node: Node; title: string }>,
  manualChildOrder: readonly string[] | null | undefined
) {
  const entriesById = new Map<string, { index: number; node: Node; title: string }>();
  for (const entry of entries) {
    entriesById.set(entry.node.id, entry);
  }
  const orderedEntries: Array<{ index: number; node: Node; title: string }> = [];
  for (const nodeId of manualChildOrder ?? []) {
    const entry = entriesById.get(nodeId);
    if (entry) {
      orderedEntries.push(entry);
    }
  }
  const orderedIdSet = new Set(orderedEntries.map((entry) => entry.node.id));
  const remainingEntries = entries
    .filter((entry) => !orderedIdSet.has(entry.node.id))
    .sort((left, right) => compareName(left, right, 1));
  return [...orderedEntries, ...remainingEntries].map((entry) => entry.node);
}
