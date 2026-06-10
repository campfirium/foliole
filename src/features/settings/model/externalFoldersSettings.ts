import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

const DEFAULT_EXTERNAL_FOLDERS_ENABLED = true;

const EXTERNAL_FOLDERS_ENABLED_KEY = APP_SETTINGS_STORAGE_KEYS.externalFoldersEnabled;

export function normalizeExternalFoldersEnabled(value: unknown) {
  if (value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  return DEFAULT_EXTERNAL_FOLDERS_ENABLED;
}

export function getExternalFoldersEnabled() {
  return normalizeExternalFoldersEnabled(getWhitelistedLocalStorageItem(EXTERNAL_FOLDERS_ENABLED_KEY));
}

export function setExternalFoldersEnabled(value: boolean) {
  setWhitelistedLocalStorageItem(EXTERNAL_FOLDERS_ENABLED_KEY, value ? 'true' : 'false');
}
