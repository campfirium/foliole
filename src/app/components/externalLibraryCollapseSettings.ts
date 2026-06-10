import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

export function saveExternalCollapsedRowIds(rowIds: string[]) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryCollapsed, JSON.stringify(rowIds));
}

export function resetExternalCollapsedRowIds() {
  removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryCollapsed);
}
