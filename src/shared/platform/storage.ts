import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

const LOCAL_STORAGE_WHITELIST = new Set<string>([
  APP_SETTINGS_STORAGE_KEYS.editorDisplayMode,
  APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility
]);

function assertLocalStorageWhitelist(key: string) {
  if (!LOCAL_STORAGE_WHITELIST.has(key)) {
    throw new Error(`[storage] key is not in localStorage whitelist: ${key}`);
  }
}

function canUseLocalStorage() {
  return typeof window !== 'undefined';
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
  window.localStorage.setItem(key, value);
}

export function removeWhitelistedLocalStorageItem(key: string) {
  if (!canUseLocalStorage()) {
    return;
  }
  assertLocalStorageWhitelist(key);
  window.localStorage.removeItem(key);
}

export function getLocalStorageWhitelist() {
  return Array.from(LOCAL_STORAGE_WHITELIST);
}
