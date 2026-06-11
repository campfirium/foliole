import { getLocalStorageAppSettingsKeys } from '../config/appSettingsClassification';

import { saveRuntimeAppSettingsState } from './appSettingsState';

const LOCAL_STORAGE_WHITELIST = new Set<string>(getLocalStorageAppSettingsKeys());

function assertLocalStorageWhitelist(key: string) {
  if (!LOCAL_STORAGE_WHITELIST.has(key)) {
    throw new Error(`[storage] key is not in localStorage whitelist: ${key}`);
  }
}

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

function readWhitelistedLocalStorageSnapshot() {
  const snapshot: Record<string, string> = {};
  if (!canUseLocalStorage()) {
    return snapshot;
  }
  for (const key of LOCAL_STORAGE_WHITELIST) {
    const value = window.localStorage.getItem(key);
    if (typeof value === 'string') {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function persistSnapshotToRuntimeStorage() {
  const settings = readWhitelistedLocalStorageSnapshot();
  void saveRuntimeAppSettingsState(settings);
}

export function getWhitelistedLocalStorageItem(key: string): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  assertLocalStorageWhitelist(key);
  return window.localStorage.getItem(key);
}

export function setWhitelistedLocalStorageItem(key: string, value: string) {
  if (!canUseLocalStorage()) {
    return;
  }
  assertLocalStorageWhitelist(key);
  if (window.localStorage.getItem(key) === value) {
    return;
  }
  window.localStorage.setItem(key, value);
  persistSnapshotToRuntimeStorage();
}

export function removeWhitelistedLocalStorageItem(key: string) {
  if (!canUseLocalStorage()) {
    return;
  }
  assertLocalStorageWhitelist(key);
  window.localStorage.removeItem(key);
  persistSnapshotToRuntimeStorage();
}

export function getLocalStorageWhitelist() {
  return Array.from(LOCAL_STORAGE_WHITELIST);
}
