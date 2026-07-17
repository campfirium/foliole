import { getLocalStorageAppSettingsKeys } from '../config/appSettingsClassification';

import { saveRuntimeAppSettingsState } from './appSettingsState';

const LOCAL_STORAGE_WHITELIST = new Set<string>(getLocalStorageAppSettingsKeys());
export const RUNTIME_APP_SETTINGS_SAVED_EVENT = 'foliole:runtime-app-settings-saved';

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

async function persistSnapshotToRuntimeStorage() {
  const settings = readWhitelistedLocalStorageSnapshot();
  const saved = await saveRuntimeAppSettingsState(settings);
  if (saved && canUseLocalStorage()) {
    window.dispatchEvent(new window.Event(RUNTIME_APP_SETTINGS_SAVED_EVENT));
  }
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
  void persistSnapshotToRuntimeStorage();
}

export function removeWhitelistedLocalStorageItem(key: string) {
  if (!canUseLocalStorage()) {
    return;
  }
  assertLocalStorageWhitelist(key);
  window.localStorage.removeItem(key);
  void persistSnapshotToRuntimeStorage();
}

export function getLocalStorageWhitelist() {
  return Array.from(LOCAL_STORAGE_WHITELIST);
}
