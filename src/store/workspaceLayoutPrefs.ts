import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../shared/platform/storage';

function readBooleanPreference(key: string, fallback: boolean) {
  const value = getWhitelistedLocalStorageItem(key);
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

function writeBooleanPreference(key: string, value: boolean) {
  setWhitelistedLocalStorageItem(key, value ? 'true' : 'false');
}

export function loadListCollapsedPreference() {
  return readBooleanPreference(APP_SETTINGS_STORAGE_KEYS.listCollapsed, false);
}

export function saveListCollapsedPreference(value: boolean) {
  writeBooleanPreference(APP_SETTINGS_STORAGE_KEYS.listCollapsed, value);
}

export function loadRightSidebarCollapsedPreference() {
  return readBooleanPreference(APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed, false);
}

export function saveRightSidebarCollapsedPreference(value: boolean) {
  writeBooleanPreference(APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed, value);
}
