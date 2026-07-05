import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

import type { ExternalLibraryDocumentItem } from './externalLibraryBrowseModel';

export type WorkspaceContentSortKey = 'deletedAt' | 'importedAt' | 'lastOpenedAt' | 'manual' | 'modifiedAt' | 'name' | 'savedAt';
export type WorkspaceContentSortDirection = 'asc' | 'desc';

export interface WorkspaceContentSortState {
  direction: WorkspaceContentSortDirection;
  key: WorkspaceContentSortKey;
}

const DEFAULT_WORKSPACE_CONTENT_SORT: WorkspaceContentSortState = {
  direction: 'desc',
  key: 'modifiedAt'
};

function compareText(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), 'en', { numeric: true, sensitivity: 'base' });
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

function directionMultiplier(direction: WorkspaceContentSortDirection) {
  return direction === 'asc' ? -1 : 1;
}

export function resolveDefaultWorkspaceContentSortDirection(key: WorkspaceContentSortKey): WorkspaceContentSortDirection {
  return key === 'manual' || key === 'name' ? 'asc' : 'desc';
}

function isWorkspaceContentSortKey(value: string): value is WorkspaceContentSortKey {
  return (
    value === 'deletedAt' ||
    value === 'importedAt' ||
    value === 'lastOpenedAt' ||
    value === 'manual' ||
    value === 'modifiedAt' ||
    value === 'name' ||
    value === 'savedAt'
  );
}

function isWorkspaceContentSortDirection(value: string): value is WorkspaceContentSortDirection {
  return value === 'asc' || value === 'desc';
}

export function loadWorkspaceContentSortPreference(): WorkspaceContentSortState {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort);
  if (!raw) return DEFAULT_WORKSPACE_CONTENT_SORT;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceContentSortState>;
    const key = migrateWorkspaceContentSortKey(String(parsed.key));
    const direction = String(parsed.direction);
    if (key && isWorkspaceContentSortDirection(direction)) {
      return { direction: key === 'lastOpenedAt' ? 'desc' : key === 'manual' ? 'asc' : direction, key };
    }
  } catch {
    return DEFAULT_WORKSPACE_CONTENT_SORT;
  }
  return DEFAULT_WORKSPACE_CONTENT_SORT;
}

function migrateWorkspaceContentSortKey(value: string) {
  if (value === 'date' || value === 'savedAt' || value === 'importedAt') return 'modifiedAt';
  if (value === 'title') return 'name';
  return isWorkspaceContentSortKey(value) ? value : null;
}

export function normalizeWorkspaceContentSort(
  sort: WorkspaceContentSortState,
  supportedKeys: WorkspaceContentSortKey[]
): WorkspaceContentSortState {
  if (supportedKeys.includes(sort.key)) {
    return sort;
  }
  const key = supportedKeys[0] ?? DEFAULT_WORKSPACE_CONTENT_SORT.key;
  return {
    direction: resolveDefaultWorkspaceContentSortDirection(key),
    key
  };
}

export function saveWorkspaceContentSortPreference(value: WorkspaceContentSortState) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort, JSON.stringify(value));
}

export function compareWorkspaceContentNodes(
  left: WorkspaceListNode,
  right: WorkspaceListNode,
  sort: WorkspaceContentSortState,
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined> = {}
) {
  if (sort.key === 'name') {
    const titleResult = compareText(left.title, right.title) * (sort.direction === 'asc' ? 1 : -1);
    if (titleResult !== 0) return titleResult;
  } else if (sort.key === 'lastOpenedAt') {
    const dateResult = compareTimestampDesc(nodeViewById[left.id]?.updatedAt, nodeViewById[right.id]?.updatedAt) * directionMultiplier(sort.direction);
    if (dateResult !== 0) return dateResult;
  } else if (sort.key === 'modifiedAt') {
    const dateResult = compareTimestampDesc(left.updatedAt, right.updatedAt) * directionMultiplier(sort.direction);
    if (dateResult !== 0) return dateResult;
  } else {
    const dateResult = compareTimestampDesc(left.createdAt, right.createdAt) * directionMultiplier(sort.direction);
    if (dateResult !== 0) return dateResult;
  }
  const fallbackTitleResult = compareText(left.title, right.title);
  if (fallbackTitleResult !== 0) return fallbackTitleResult;
  return left.id.localeCompare(right.id);
}

export function sortWorkspaceContentRows(
  rows: NodeTreeRow[],
  sort: WorkspaceContentSortState,
  nodeViewById: Record<string, { updatedAt?: string | null } | undefined> = {}
) {
  return [...rows].sort((left, right) => compareWorkspaceContentNodes(left.node, right.node, sort, nodeViewById));
}

export function sortTrashContentRows(
  rows: NodeTreeRow[],
  sort: WorkspaceContentSortState,
  deletedAtById: Record<string, string | undefined>
) {
  return [...rows].sort((left, right) => {
    if (sort.key === 'name') {
      return compareWorkspaceContentNodes(left.node, right.node, sort);
    }
    const dateResult = compareTimestampDesc(deletedAtById[left.node.id], deletedAtById[right.node.id]) * directionMultiplier(sort.direction);
    if (dateResult !== 0) return dateResult;
    return compareWorkspaceContentNodes(left.node, right.node, { direction: 'asc', key: 'name' });
  });
}

function compareExternalDocuments(
  left: ExternalLibraryDocumentItem,
  right: ExternalLibraryDocumentItem,
  sort: WorkspaceContentSortState,
  lastOpenedAtByPath: Record<string, string | undefined> = {}
) {
  if (sort.key === 'name') {
    const titleResult = compareText(left.title, right.title) * (sort.direction === 'asc' ? 1 : -1);
    if (titleResult !== 0) return titleResult;
  } else if (sort.key === 'lastOpenedAt') {
    const dateResult =
      compareTimestampDesc(lastOpenedAtByPath[left.absolutePath], lastOpenedAtByPath[right.absolutePath]) *
      directionMultiplier(sort.direction);
    if (dateResult !== 0) return dateResult;
  } else {
    const dateResult = compareTimestampDesc(left.modifiedAt, right.modifiedAt) * directionMultiplier(sort.direction);
    if (dateResult !== 0) return dateResult;
  }
  const fallbackTitleResult = compareText(left.title, right.title);
  if (fallbackTitleResult !== 0) return fallbackTitleResult;
  return left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortExternalDocuments(
  documents: ExternalLibraryDocumentItem[],
  sort: WorkspaceContentSortState,
  lastOpenedAtByPath: Record<string, string | undefined> = {}
) {
  return [...documents].sort((left, right) => compareExternalDocuments(left, right, sort, lastOpenedAtByPath));
}

export function compareNaturalName(left: string, right: string) {
  return compareText(left, right);
}
