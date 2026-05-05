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

function readNumberPreference(key: string, fallback: number) {
  const value = getWhitelistedLocalStorageItem(key);
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function writeNumberPreference(key: string, value: number) {
  setWhitelistedLocalStorageItem(key, String(value));
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

export function loadWorkspaceLayoutPreferenceSnapshot(defaultLayoutState: {
  documentMaxWidth: number;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  listWidth: number;
  rightSidebarWidth: number;
}) {
  return {
    documentMaxWidth: loadDocumentWidthPreference(defaultLayoutState.documentMaxWidth),
    isListCollapsed: loadListCollapsedPreference(),
    listWidth: loadListWidthPreference(defaultLayoutState.listWidth),
    isRightSidebarCollapsed: loadRightSidebarCollapsedPreference(),
    rightSidebarWidth: loadRightSidebarWidthPreference(defaultLayoutState.rightSidebarWidth)
  };
}

export function loadListWidthPreference(fallback: number) {
  return readNumberPreference(APP_SETTINGS_STORAGE_KEYS.listWidth, fallback);
}

export function saveListWidthPreference(value: number) {
  writeNumberPreference(APP_SETTINGS_STORAGE_KEYS.listWidth, value);
}

export function loadDualListWidthPreference(fallback: number) {
  return readNumberPreference(APP_SETTINGS_STORAGE_KEYS.dualListWidth, fallback);
}

export function saveDualListWidthPreference(value: number) {
  writeNumberPreference(APP_SETTINGS_STORAGE_KEYS.dualListWidth, value);
}

export function loadVirtualSectionHeightPreference(fallback: number) {
  return readNumberPreference(APP_SETTINGS_STORAGE_KEYS.virtualSectionHeight, fallback);
}

export function saveVirtualSectionHeightPreference(value: number) {
  writeNumberPreference(APP_SETTINGS_STORAGE_KEYS.virtualSectionHeight, value);
}

export function loadExternalSectionHeightPreference(fallback: number) {
  return readNumberPreference(APP_SETTINGS_STORAGE_KEYS.externalSectionHeight, fallback);
}

export function saveExternalSectionHeightPreference(value: number) {
  writeNumberPreference(APP_SETTINGS_STORAGE_KEYS.externalSectionHeight, value);
}

export function loadDocumentWidthPreference(fallback: number) {
  return readNumberPreference(APP_SETTINGS_STORAGE_KEYS.documentWidth, fallback);
}

export function saveDocumentWidthPreference(value: number) {
  writeNumberPreference(APP_SETTINGS_STORAGE_KEYS.documentWidth, value);
}

export function loadRightSidebarWidthPreference(fallback: number) {
  return readNumberPreference(APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth, fallback);
}

export function saveRightSidebarWidthPreference(value: number) {
  writeNumberPreference(APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth, value);
}
