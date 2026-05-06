import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  normalizeExternalDirectoryPath,
  resolveExternalFolderLabel,
  type ExternalLibraryFolder
} from './externalLibraryBrowseModel';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from './storage';

export interface ExternalLibraryFolderOrderItem {
  folderPath: string;
  id: string;
}

function normalizeIdentityPath(folderPath: string) {
  return normalizeExternalDirectoryPath(folderPath).toLocaleLowerCase();
}

function compareNaturalName(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), undefined, { numeric: true, sensitivity: 'base' });
}

function toOrderItem(folder: Pick<ExternalLibraryFolder, 'folderPath' | 'id'>): ExternalLibraryFolderOrderItem {
  return {
    folderPath: normalizeIdentityPath(folder.folderPath),
    id: folder.id
  };
}

export function parseExternalLibraryFolderOrder(raw: string | null | undefined): ExternalLibraryFolderOrderItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const folderPath = typeof record.folderPath === 'string' ? normalizeIdentityPath(record.folderPath) : '';
        return id && folderPath ? { id, folderPath } : null;
      })
      .filter((item): item is ExternalLibraryFolderOrderItem => Boolean(item));
  } catch {
    return [];
  }
}

export function serializeExternalLibraryFolderOrder(folders: Array<Pick<ExternalLibraryFolder, 'folderPath' | 'id'>>) {
  return JSON.stringify(folders.map(toOrderItem));
}

export function createExternalLibraryFolderOrder(folders: Array<Pick<ExternalLibraryFolder, 'folderPath' | 'id'>>) {
  return folders.map(toOrderItem);
}

function resolveOrderRank(folder: Pick<ExternalLibraryFolder, 'folderPath' | 'id'>, order: ExternalLibraryFolderOrderItem[]) {
  const identity = toOrderItem(folder);
  const idRank = order.findIndex((item) => item.id === identity.id);
  if (idRank >= 0) return idRank;
  return order.findIndex((item) => item.folderPath === identity.folderPath);
}

export function sortExternalLibraryFolders<T extends Pick<ExternalLibraryFolder, 'folderPath' | 'id'>>(
  folders: T[],
  order: ExternalLibraryFolderOrderItem[]
) {
  return [...folders].sort((left, right) => {
    const leftRank = resolveOrderRank(left, order);
    const rightRank = resolveOrderRank(right, order);
    if (leftRank >= 0 && rightRank >= 0 && leftRank !== rightRank) return leftRank - rightRank;
    if (leftRank >= 0) return -1;
    if (rightRank >= 0) return 1;
    return compareNaturalName(resolveExternalFolderLabel(left.folderPath), resolveExternalFolderLabel(right.folderPath));
  });
}

export function loadExternalLibraryFolderOrder() {
  return parseExternalLibraryFolderOrder(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryFolderOrder)
  );
}

export function saveExternalLibraryFolderOrder(folders: Array<Pick<ExternalLibraryFolder, 'folderPath' | 'id'>>) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.externalLibraryFolderOrder,
    serializeExternalLibraryFolderOrder(folders)
  );
}

export function moveExternalLibraryFolder<T extends Pick<ExternalLibraryFolder, 'folderPath' | 'id'>>(
  folders: T[],
  sourceId: string,
  targetId: string,
  intent: 'after' | 'before'
) {
  const source = folders.find((folder) => folder.id === sourceId);
  if (!source) return folders;
  const remaining = folders.filter((folder) => folder.id !== sourceId);
  const targetIndex = remaining.findIndex((folder) => folder.id === targetId);
  if (targetIndex < 0) return folders;
  const insertIndex = intent === 'before' ? targetIndex : targetIndex + 1;
  return [
    ...remaining.slice(0, insertIndex),
    source,
    ...remaining.slice(insertIndex)
  ];
}
