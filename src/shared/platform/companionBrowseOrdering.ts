import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';

type CompanionBrowseNode = WorkspaceSnapshot['nodesById'][string];

function resolveCompanionLastOpenedAt(snapshot: WorkspaceSnapshot, nodeId: string) {
  return snapshot.persistedNodeViewById?.[nodeId]?.updatedAt?.trim() || null;
}

function resolveCompanionImportAt(node: CompanionBrowseNode) {
  return node.createdAt.trim() || node.updatedAt.trim();
}

export function compareCompanionLastOpened(snapshot: WorkspaceSnapshot, left: CompanionBrowseNode, right: CompanionBrowseNode) {
  const leftOpenedAt = resolveCompanionLastOpenedAt(snapshot, left.id);
  const rightOpenedAt = resolveCompanionLastOpenedAt(snapshot, right.id);
  if (leftOpenedAt && rightOpenedAt && leftOpenedAt !== rightOpenedAt) {
    return rightOpenedAt.localeCompare(leftOpenedAt);
  }
  if (leftOpenedAt) return -1;
  if (rightOpenedAt) return 1;

  const importAtCompare = resolveCompanionImportAt(right).localeCompare(resolveCompanionImportAt(left));
  if (importAtCompare !== 0) return importAtCompare;
  return right.updatedAt.localeCompare(left.updatedAt);
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function resolveTitle(node: CompanionBrowseNode) {
  return node.title.trim() || 'Untitled';
}

function compareTimestampDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftTimestamp = left?.trim() || null;
  const rightTimestamp = right?.trim() || null;
  if (!leftTimestamp && !rightTimestamp) return 0;
  if (!leftTimestamp) return 1;
  if (!rightTimestamp) return -1;
  return rightTimestamp.localeCompare(leftTimestamp);
}

function compareCompanionBrowseNodes(
  snapshot: WorkspaceSnapshot,
  left: CompanionBrowseNode,
  right: CompanionBrowseNode,
  sortKey: FolderListSortKey,
  directionMultiplier: number
) {
  if (sortKey === 'dateLastOpened') {
    const result = compareCompanionLastOpened(snapshot, left, right) * directionMultiplier;
    if (result !== 0) return result;
  }
  if (sortKey === 'dateImported') {
    const result = compareTimestampDesc(resolveCompanionImportAt(left), resolveCompanionImportAt(right)) * directionMultiplier;
    if (result !== 0) return result;
  }
  if (sortKey === 'dateSaved') {
    const result = compareTimestampDesc(left.updatedAt, right.updatedAt) * directionMultiplier;
    if (result !== 0) return result;
  }
  return compareText(resolveTitle(left), resolveTitle(right));
}

export function sortCompanionBrowseNodes(
  snapshot: WorkspaceSnapshot,
  nodes: CompanionBrowseNode[],
  sortKey: FolderListSortKey,
  sortDirection: FolderListSortDirection
) {
  const directionMultiplier = sortDirection === 'asc' ? -1 : 1;
  return [...nodes].sort((left, right) =>
    compareCompanionBrowseNodes(snapshot, left, right, sortKey, directionMultiplier)
  );
}
