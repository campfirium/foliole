import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

function normalizeCollapsedRowIds(value: string | null) {
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

export function loadExternalCollapsedRowIds() {
  const storedValue = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryCollapsed);
  if (storedValue === null) {
    return null;
  }
  return normalizeCollapsedRowIds(storedValue);
}

export function saveExternalCollapsedRowIds(rowIds: string[]) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryCollapsed, JSON.stringify(rowIds));
}

export function resetExternalCollapsedRowIds() {
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryCollapsed);
}
