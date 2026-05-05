import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

const LOCAL_STORAGE_WHITELIST = new Set<string>([
  APP_SETTINGS_STORAGE_KEYS.editorDisplayMode,
  APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility,
  APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory,
  APP_SETTINGS_STORAGE_KEYS.uiFont,
  APP_SETTINGS_STORAGE_KEYS.customUiFont,
  APP_SETTINGS_STORAGE_KEYS.interfaceFont,
  APP_SETTINGS_STORAGE_KEYS.monospaceFont,
  APP_SETTINGS_STORAGE_KEYS.baseColor,
  APP_SETTINGS_STORAGE_KEYS.accentColor,
  APP_SETTINGS_STORAGE_KEYS.interfaceFontSize,
  APP_SETTINGS_STORAGE_KEYS.customInterfaceFont,
  APP_SETTINGS_STORAGE_KEYS.customMonospaceFont
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
