import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

function normalizeNodeIdList(value: string | null) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}

function writeNodeIdList(key: string, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    removeWhitelistedLocalStorageItem(key);
    return;
  }
  setWhitelistedLocalStorageItem(key, JSON.stringify(nodeIds));
}

export function loadManualCollapsedNoteNodeIds() {
  return normalizeNodeIdList(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeListManualCollapsed));
}

export function saveManualCollapsedNoteNodeIds(nodeIds: string[]) {
  writeNodeIdList(APP_SETTINGS_STORAGE_KEYS.nodeListManualCollapsed, nodeIds);
}

export function loadManualExpandedNoteNodeIds() {
  return normalizeNodeIdList(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeListManualExpanded));
}

export function saveManualExpandedNoteNodeIds(nodeIds: string[]) {
  writeNodeIdList(APP_SETTINGS_STORAGE_KEYS.nodeListManualExpanded, nodeIds);
}

export function loadCollapsedTrashNodeIds() {
  return normalizeNodeIdList(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodeTrashManualCollapsed));
}

export function saveCollapsedTrashNodeIds(nodeIds: string[]) {
  writeNodeIdList(APP_SETTINGS_STORAGE_KEYS.nodeTrashManualCollapsed, nodeIds);
}
