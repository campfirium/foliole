import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

const ENABLED_VALUE = 'true';

export function isDevReviewStatusBarPersistenceEnabled() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarPersistenceEnabled) === ENABLED_VALUE;
}

export function isDevReviewStatusBarOpen() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarOpen) === ENABLED_VALUE;
}

export function setDevReviewStatusBarPersistenceEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarPersistenceEnabled, enabled ? ENABLED_VALUE : 'false');
}

export function setDevReviewStatusBarOpen(open: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarOpen, open ? ENABLED_VALUE : 'false');
}
